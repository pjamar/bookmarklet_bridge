import { INTERNAL_MESSAGE_KIND } from "../shared/constants";
import {
  buildGeneratorOutput,
  indentBlock
} from "../shared/bookmarklet-generator";
import { formatGeneratorJavaScript, formatGeneratorSettingsText } from "../shared/generator-format";
import {
  scanBookmarkTreeForBridgeBookmarklets,
  type BridgeBookmarkletScanResult
} from "../shared/bookmarklet-scan";
import {
  buildConfigurationExport,
  decryptConfigurationExport,
  encryptConfigurationExport,
  parseEncryptedConfigurationExport
} from "../shared/configuration-backup";
import { isBridgeResponse } from "../shared/errors";
import { HIGHLIGHT_THEME, highlightIntoElement } from "../shared/highlight";
import { renderMarkdown } from "../shared/markdown";
import type {
  BookmarkletSettingDefinition,
  BookmarkletSettingScalarValue,
  BookmarkletSettingsSchema,
  BookmarkletSettingsValues,
  BridgeSettings,
  BridgeState,
  ExecutionLogEntry,
  PolicyEntry
} from "../shared/types";

type ViewName = "settings" | "approved" | "denied" | "log" | "generator" | "scanner";
type GeneratorSnippet = "toast" | "get" | "post" | "download" | "downloadUrl" | "copyText" | "tryCatch";

interface GeneratorDraft {
  name: string;
  version: number;
  extendedDescription: string;
  settingsText: string;
  runBody: string;
}

let state: BridgeState = {
  settings: {
    allowedOrigins: [],
    toastDefaults: { durationMs: 2200 },
    requestDefaults: { timeoutMs: 10000 }
  },
  policies: [],
  logs: [],
  bookmarkletSettingsSchemas: {},
  bookmarkletSettingsValues: {}
};
let currentView: ViewName = "settings";
let selectedPolicyHash: string | null = null;
let selectedPolicyScreen: "detail" | "settings" = "detail";
let policySettingsStatus: { definitionHash: string; tone: "success" | "error"; message: string } | null = null;
let settingsStatus: { tone: "success" | "error"; message: string } | null = null;
let bookmarkScannerStatus: { tone: "success" | "error"; message: string } | null = null;
let generatorFormatStatus: { tone: "success" | "error"; message: string } | null = null;
let scannedBookmarklets: BridgeBookmarkletScanResult[] = [];
const GENERATOR_DRAFT_STORAGE_KEY = "bookmarklet-bridge.generator-draft";
const defaultGeneratorDraft: GeneratorDraft = {
  name: "My Bookmarklet",
  version: 1,
  extendedDescription: "",
  settingsText: "{}",
  runBody: `const selection = window.getSelection ? String(window.getSelection()).trim() : "";
const title = document.title || "Untitled";

await bridge.toast("Running bookmarklet...", { variant: "info" });

if (selection) {
  console.log({ title, selection, url: location.href });
}

await bridge.toast("Bookmarklet finished", { variant: "success" });`
};
let generatorDraft = loadGeneratorDraft();

ensureHighlightTheme();

async function loadState(): Promise<void> {
  const loaded = (await browser.runtime.sendMessage({
    kind: INTERNAL_MESSAGE_KIND.GET_STATE
  })) as Partial<BridgeState>;
  state = {
    settings: loaded.settings ?? state.settings,
    policies: loaded.policies ?? [],
    logs: loaded.logs ?? [],
    bookmarkletSettingsSchemas: loaded.bookmarkletSettingsSchemas ?? {},
    bookmarkletSettingsValues: loaded.bookmarkletSettingsValues ?? {}
  };
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) {
    return;
  }

  const selectedPolicy = state.policies.find((policy) => policy.definitionHash === selectedPolicyHash) ?? null;
  const markup = `
    <div class="app">
      <aside>
        <div class="title">Bookmarklet Bridge</div>
        <p class="muted">Review bookmarklet source, manage bridge policy, scan bookmarks, and generate bookmarklets for the injected bridge runtime.</p>
        <div class="row" style="margin: 0 0 16px;">
          <a class="button inline pastel-sage" href="api-reference.html" target="_blank" rel="noopener noreferrer">Open API Reference</a>
        </div>
        <nav>
          ${navButton("settings", "Bridge Settings")}
          ${navButton("approved", "Approved")}
          ${navButton("denied", "Denied")}
          ${navButton("scanner", "Bookmark Scanner")}
          ${navButton("log", "Log")}
          ${navButton("generator", "Generator")}
        </nav>
      </aside>
      <main>${
        selectedPolicy
          ? selectedPolicyScreen === "settings"
            ? renderPolicySettingsScreen(selectedPolicy)
            : renderPolicyDetail(selectedPolicy)
          : renderView(currentView)
      }</main>
    </div>
  `;
  app.replaceChildren(createFragmentFromHtml(markup));

  applyHighlighting(app);
  bindEvents();
}

function createFragmentFromHtml(markup: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const fragment = document.createDocumentFragment();
  fragment.append(...Array.from(parsed.body.childNodes));
  return fragment;
}

function navButton(view: ViewName, label: string): string {
  return `<button data-view="${view}" class="${currentView === view ? "active" : ""} ${navButtonClass(view)}">${label}</button>`;
}

function navButtonClass(view: ViewName): string {
  switch (view) {
    case "settings":
      return "nav-sand";
    case "approved":
      return "nav-mint";
    case "denied":
      return "nav-rose";
    case "scanner":
      return "nav-sky";
    case "log":
      return "nav-sky";
    case "generator":
      return "nav-gold";
  }
}

function renderView(view: ViewName): string {
  switch (view) {
    case "settings":
      return renderSettings();
    case "approved":
      return renderPolicyList("allow", "Approved bookmarklets");
    case "denied":
      return renderPolicyList("deny", "Denied bookmarklets");
    case "log":
      return renderLogView();
    case "scanner":
      return renderBookmarkScanner();
    case "generator":
      return renderGenerator();
  }
}

function renderSettings(): string {
  const settingsStatusMarkup = settingsStatus
    ? `<div class="status ${settingsStatus.tone}">${escapeHtml(settingsStatus.message)}</div>`
    : "";
  return `
    <section class="panel">
      <h2>Bridge Settings</h2>
      <p class="muted">Allowed origins are global extension rules. Leave the list empty to allow any origin.</p>
      <div class="grid">
        <label>
          <div>Allowed Origins, one per line</div>
          <textarea id="allowedOrigins">${escapeHtml(state.settings.allowedOrigins.join("\n"))}</textarea>
        </label>
        <div class="grid two">
          <label>
            <div>Request Timeout (ms)</div>
            <input id="timeoutMs" type="number" value="${state.settings.requestDefaults.timeoutMs}" />
          </label>
          <label>
            <div>Default Toast Duration (ms)</div>
            <input id="toastDurationMs" type="number" value="${state.settings.toastDefaults.durationMs}" />
          </label>
        </div>
      </div>
      <div class="row" style="margin-top:16px;">
        <button id="saveSettings" class="button inline pastel-primary">Save Settings</button>
        <button id="exportEncryptedConfiguration" class="button inline pastel-blue">Export Encrypted Backup</button>
        <button id="importEncryptedConfiguration" class="button inline pastel-gold">Import Encrypted Backup</button>
        <input id="importEncryptedConfigurationFile" type="file" accept=".json,application/json" hidden />
      </div>
      <p class="muted">Backups include global bridge settings, approved bookmarklets, and bookmarklet-scoped settings. The JSON envelope stays readable enough to identify the file and export date, while the payload remains encrypted.</p>
      ${settingsStatusMarkup}
    </section>
  `;
}

function renderPolicyList(decision: "allow" | "deny", title: string): string {
  const policies = state.policies.filter((policy) => policy.decision === decision);
  return `
    <section class="panel">
      <h2>${title}</h2>
      <p class="muted">${policies.length} stored policy entr${policies.length === 1 ? "y" : "ies"}.</p>
      ${
        policies
          .map(
            (policy) => `
              <div class="list-item">
                <strong>${escapeHtml(policy.name)}</strong>
                <div class="muted">Version ${policy.version} • ${escapeHtml(policy.definitionHash)}</div>
                <div>${renderChips(policy.inferredActions)}</div>
                <div class="muted">Last used: ${escapeHtml(policy.lastUsedAt ?? "Never")}</div>
                <div class="row" style="margin-top:10px;">
                  <button class="button inline" data-open-policy="${policy.definitionHash}">Inspect</button>
                  ${
                    decision === "allow" && policyHasEditableSettings(policy)
                      ? `<button class="button inline pastel-sky" data-open-policy-settings="${policy.definitionHash}">Edit Settings</button>`
                      : ""
                  }
                  <button class="button inline" data-set-decision="${policy.definitionHash}" data-next-decision="${decision === "allow" ? "deny" : "allow"}">
                    Mark ${decision === "allow" ? "Denied" : "Allowed"}
                  </button>
                  <button class="button inline" data-delete-policy="${policy.definitionHash}">Delete</button>
                </div>
              </div>
            `
          )
          .join("") ||
        `<div class="list-item empty-state">
          <strong>No bookmarklets in this section.</strong>
          <div class="muted">Change a decision from the other tab or approve a bookmarklet to populate this list.</div>
        </div>`
      }
    </section>
  `;
}

function renderPolicyDetail(policy: PolicyEntry): string {
  const settingsSection = renderPolicySettingsSection(policy);
  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between;">
        <h2>Bookmarklet Detail</h2>
        <button class="button inline" data-close-detail="true">Back</button>
      </div>
      <div class="grid two">
        <div>
          <p><strong>Name:</strong> ${escapeHtml(policy.name)}</p>
          <p><strong>Version:</strong> ${policy.version}</p>
          <p><strong>Decision:</strong> ${policy.decision}</p>
          <p><strong>Definition Hash:</strong> ${escapeHtml(policy.definitionHash)}</p>
          <p><strong>Source Hash:</strong> ${escapeHtml(policy.sourceHash)}</p>
          <p><strong>Updated:</strong> ${escapeHtml(policy.updatedAt)}</p>
          <p><strong>Last Used:</strong> ${escapeHtml(policy.lastUsedAt ?? "Never")}</p>
        </div>
        <div>
          <p><strong>Inferred Actions:</strong></p>
          <div>${renderChips(policy.inferredActions)}</div>
          <div class="row" style="margin-top:12px;">
            <button class="button inline" data-copy-value="${escapeAttr(policy.definitionHash)}">Copy Definition Hash</button>
            <button class="button inline" data-copy-value="${escapeAttr(policy.decodedSource)}">Copy Source</button>
          </div>
        </div>
      </div>
    </section>
    ${
      policy.extendedDescription
        ? `<section class="panel">
      <h3>Extended Description</h3>
      <div class="markdown-body">${renderMarkdown(policy.extendedDescription)}</div>
    </section>`
        : ""
    }
    <section class="panel">
      <h3>Readable Source</h3>
      <pre><code data-highlight="javascript">${escapeHtml(policy.decodedSource)}</code></pre>
    </section>
    <section class="panel">
      <h3>Canonical Bookmarklet</h3>
      <pre><code data-highlight="json">${escapeHtml(policy.canonicalBookmarklet)}</code></pre>
    </section>
    ${settingsSection}
  `;
}

function renderPolicySettingsScreen(policy: PolicyEntry): string {
  if (!policyHasEditableSettings(policy)) {
    return `
      <section class="panel">
        <div class="row" style="justify-content:space-between;">
          <h2>Bookmarklet Settings</h2>
          <button class="button inline" data-close-detail="true">Back</button>
        </div>
        <p class="muted">This bookmarklet does not declare any editable settings.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2>Edit Bookmarklet Settings</h2>
          <p class="muted">${escapeHtml(policy.name)} v${policy.version} • ${escapeHtml(policy.definitionHash)}</p>
        </div>
        <button class="button inline" data-close-detail="true">Back</button>
      </div>
    </section>
    ${renderPolicySettingsSection(policy)}
  `;
}

function renderPolicySettingsSection(policy: PolicyEntry): string {
  const schema = state.bookmarkletSettingsSchemas[policy.definitionHash];
  if (policy.decision !== "allow" || !schema || Object.keys(schema).length === 0) {
    return "";
  }

  const values = state.bookmarkletSettingsValues[policy.definitionHash] ?? {};
  const status =
    policySettingsStatus?.definitionHash === policy.definitionHash
      ? `<div class="status ${policySettingsStatus.tone}">${escapeHtml(policySettingsStatus.message)}</div>`
      : "";
  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h3>Bookmarklet Settings</h3>
          <p class="muted">These values are scoped to this exact definition hash and are visible to the bookmarklet through <code>bridge.getSettings()</code>.</p>
        </div>
        <div class="row">
          <button class="button inline pastel-peach" data-reset-all-settings="${escapeAttr(policy.definitionHash)}">Reset All</button>
          <button class="button inline pastel-primary" data-save-policy-settings="${escapeAttr(policy.definitionHash)}">Save Settings</button>
        </div>
      </div>
      ${status}
      <div class="grid">
        ${Object.entries(schema)
          .map(([key, definition]) => renderPolicySettingField(policy.definitionHash, key, definition, values[key]))
          .join("")}
      </div>
    </section>
  `;
}

function policyHasEditableSettings(policy: PolicyEntry): boolean {
  const schema = state.bookmarkletSettingsSchemas[policy.definitionHash];
  return policy.decision === "allow" && Boolean(schema && Object.keys(schema).length > 0);
}

function renderPolicySettingField(
  definitionHash: string,
  key: string,
  definition: BookmarkletSettingDefinition,
  currentValue: BookmarkletSettingScalarValue | undefined
): string {
  const current = currentValue ?? definition.default;
  const inputId = `setting-${definitionHash}-${key}`;
  const control = renderPolicySettingControl(inputId, definitionHash, key, definition, current);
  return `
    <div class="list-item">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:16px;">
        <div>
          <strong>${escapeHtml(definition.label)}</strong>
          <div class="muted">${escapeHtml(definition.description)}</div>
          <div class="muted">Key: <code>${escapeHtml(key)}</code> • Type: <code>${escapeHtml(definition.type)}</code></div>
          <div class="muted">Default: <code>${escapeHtml(formatSettingValue(definition.default))}</code></div>
        </div>
        <button class="button inline pastel-gold" data-reset-setting="${escapeAttr(key)}" data-definition-hash="${escapeAttr(definitionHash)}">Reset</button>
      </div>
      <label for="${escapeAttr(inputId)}" style="display:block; margin-top:12px;">
        <div>Current Value</div>
        ${control}
      </label>
    </div>
  `;
}

function renderPolicySettingControl(
  inputId: string,
  definitionHash: string,
  key: string,
  definition: BookmarkletSettingDefinition,
  currentValue: BookmarkletSettingScalarValue
): string {
  const sharedAttributes = `id="${escapeAttr(inputId)}" data-setting-input="${escapeAttr(key)}" data-definition-hash="${escapeAttr(definitionHash)}" data-setting-type="${escapeAttr(definition.type)}"`;
  switch (definition.type) {
    case "boolean":
      return `<input ${sharedAttributes} type="checkbox" ${currentValue === true ? "checked" : ""} />`;
    case "text":
      return definition.multiline
        ? `<textarea ${sharedAttributes} ${definition.maxLength !== undefined ? `maxlength="${definition.maxLength}"` : ""} placeholder="${escapeAttr(definition.placeholder ?? "")}">${escapeHtml(String(currentValue))}</textarea>`
        : `<input ${sharedAttributes} type="text" value="${escapeAttr(String(currentValue))}" ${definition.maxLength !== undefined ? `maxlength="${definition.maxLength}"` : ""} placeholder="${escapeAttr(definition.placeholder ?? "")}" />`;
    case "integer":
      return `<input ${sharedAttributes} type="number" value="${escapeAttr(String(currentValue))}" ${renderNumericInputAttributes(definition.min, definition.max, definition.step)} step="${definition.step ?? 1}" />`;
    case "float":
      return `<input ${sharedAttributes} type="number" value="${escapeAttr(String(currentValue))}" ${renderNumericInputAttributes(definition.min, definition.max, definition.step)} />`;
    case "option":
      return `<select ${sharedAttributes}>${definition.options
        .map(
          (option) =>
            `<option value="${escapeAttr(option)}" ${option === currentValue ? "selected" : ""}>${escapeHtml(option)}</option>`
        )
        .join("")}</select>`;
  }
}

function renderGenerator(): string {
  const buildResult = buildGeneratorOutput(generatorDraft);
  const buildStatus = buildResult.error
    ? `<div class="status error">Build failed: ${escapeHtml(buildResult.error)}</div>`
    : `<div class="status success">Bridge output ready. Edit the code, then rebuild to refresh the bookmarklet URL.</div>`;
  const formatStatus = generatorFormatStatus
    ? `<div class="status ${generatorFormatStatus.tone}">${escapeHtml(generatorFormatStatus.message)}</div>`
    : "";

  return `
    <section class="panel">
      <h2>Bookmarklet IDE</h2>
      <p class="muted">Write the body of <code>run(bridge)</code>. Generated bookmarklets use <code>window.BookmarkletBridge.run(...)</code> and the runtime injected by the extension.</p>
      <div class="grid ide-layout">
        <div class="grid two">
          <label><div>Name</div><input id="genName" value="${escapeAttr(generatorDraft.name)}" /></label>
          <label><div>Version</div><input id="genVersion" type="number" value="${generatorDraft.version}" min="1" step="1" /></label>
        </div>
        <label>
          <div>Extended Description (Markdown)</div>
          <textarea id="genExtendedDescription" spellcheck="false">${escapeHtml(generatorDraft.extendedDescription)}</textarea>
        </label>
        <label>
          <div>Settings Schema JSON</div>
          <textarea id="genSettingsText" spellcheck="false">${escapeHtml(generatorDraft.settingsText)}</textarea>
          <div class="muted">Optional bookmarklet settings schema. These values become available through <code>bridge.getSettings()</code>.</div>
        </label>
        <label>
          <div>run(bridge) body</div>
          <textarea id="genRunBody" class="editor" spellcheck="false">${escapeHtml(generatorDraft.runBody)}</textarea>
        </label>
        <div class="row">
          <button id="generatorSnippetToast" class="button inline pastel-mint" data-snippet="toast">Insert toast</button>
          <button id="generatorSnippetGet" class="button inline pastel-sky" data-snippet="get">Insert GET</button>
          <button id="generatorSnippetPost" class="button inline pastel-peach" data-snippet="post">Insert POST</button>
          <button id="generatorSnippetDownload" class="button inline pastel-gold" data-snippet="download">Insert download</button>
          <button id="generatorSnippetDownloadUrl" class="button inline pastel-peach" data-snippet="downloadUrl">Insert downloadUrl</button>
          <button id="generatorSnippetCopyText" class="button inline pastel-blue" data-snippet="copyText">Insert copyText</button>
          <button id="generatorSnippetTryCatch" class="button inline pastel-lilac" data-snippet="tryCatch">Insert try/catch</button>
        </div>
        <div class="row">
          <button id="generateBookmarklet" class="button inline pastel-primary">Build Bookmarklet</button>
          <button id="prettyPrintGenerator" class="button inline pastel-sage">Pretty Print</button>
          <button id="resetGeneratorDraft" class="button inline pastel-rose">Reset Example</button>
          <button id="copyGeneratorSource" class="button inline pastel-gold">Copy Bundle Source</button>
          <button id="copyGeneratorBookmarklet" class="button inline pastel-blue">Copy Bookmarklet URL</button>
        </div>
        ${formatStatus}
        ${buildStatus}
      </div>
    </section>
    <section class="panel">
      <h3>Bridge Actions</h3>
      <div class="doc-grid">
        ${renderGeneratorActionDoc(
          "bridge.getSettings()",
          "Read the current bookmarklet-scoped settings for this exact approved definition. Returned values are merged with defaults and are read-only in V1.",
          `const settings = await bridge.getSettings();
console.log(settings);`
        )}
        ${renderGeneratorActionDoc(
          "bridge.post(url, body, options?)",
          "Send JSON to a cross-origin endpoint through the extension. The request body must be JSON-serializable.",
          `await bridge.post("https://example.com/api/items", {
  title: document.title,
  url: location.href
}, {
  headers: { Authorization: "Bearer ..." }
});`
        )}
        ${renderGeneratorActionDoc(
          "bridge.get(url, options?)",
          "Fetch JSON or text over GET. Use this for bridge-mediated reads when the page cannot fetch directly.",
          `const result = await bridge.get("https://example.com/api/me", {
  headers: { Accept: "application/json" }
});
console.log(result);`
        )}
        ${renderGeneratorActionDoc(
          "bridge.toast(message, options?)",
          "Show non-blocking feedback in the page. Variants are success, info, and error.",
          `await bridge.toast("Memo added", {
  variant: "success",
  durationMs: 2200
});`
        )}
        ${renderGeneratorActionDoc(
          "bridge.download({ filename, content, mimeType? })",
          "Save generated text or base64-decoded binary content through the browser download manager. Filenames are sanitized and contents are not logged.",
          `await bridge.download({
  filename: "page-notes.md",
  content: "# " + (document.title || "Untitled") + "\\n\\n" + location.href,
  mimeType: "text/markdown"
});`
        )}
        ${renderGeneratorActionDoc(
          "bridge.downloadUrl({ url, filename? })",
          "Ask the browser to download a file directly from a URL. Optional filenames are sanitized and origin restrictions follow extension settings.",
          `await bridge.downloadUrl({
  url: "https://example.com/files/report.pdf",
  filename: "report.pdf"
});`
        )}
        ${renderGeneratorActionDoc(
          "bridge.copyText(text)",
          "Copy generated text through the extension clipboard permission. Copied text is not stored in logs.",
          `await bridge.copyText([
  document.title || "Untitled",
  location.href,
  window.getSelection ? String(window.getSelection()).trim() : ""
].filter(Boolean).join("\\n"));`
        )}
      </div>
      <p class="muted">The runtime handles registration, execution ids, request ids, and <code>window.postMessage</code>. Keep bookmarklet logic inside <code>run(bridge)</code>.</p>
    </section>
    <section class="panel">
      <h3>Readable Source</h3>
      <p class="muted">This is the source that approval and inspect views focus on.</p>
      <pre><code id="generatorSource" data-highlight="javascript">${escapeHtml(buildResult.runSource)}</code></pre>
    </section>
    <section class="panel">
      <h3>Generated Wrapper</h3>
      <p class="muted">This wrapper checks for window.BookmarkletBridge.run and then forwards the config to the injected runtime.</p>
      <pre><code id="generatorBundleSource" data-highlight="javascript">${escapeHtml(buildResult.fullSource)}</code></pre>
    </section>
    <section class="panel">
      <h3>Bookmarklet Link</h3>
      <p class="muted">Drag this link to your bookmarks bar.</p>
      <div class="row">
        <a
          id="generatorBookmarkletLink"
          class="button inline"
          draggable="true"
          href="${escapeAttr(buildResult.bookmarkletUrl)}"
          title="Drag to bookmarks bar"
        >${escapeHtml(generatorDraft.name || "Drag bookmarklet")}</a>
      </div>
    </section>
    <section class="panel">
      <h3>Bookmarklet URL</h3>
      <pre><code id="generatorBookmarklet">${escapeHtml(buildResult.bookmarkletUrl)}</code></pre>
    </section>
  `;
}

function renderGeneratorActionDoc(signature: string, description: string, example: string): string {
  return `
    <article class="doc-card">
      <div class="doc-signature">${escapeHtml(signature)}</div>
      <p class="muted">${escapeHtml(description)}</p>
      <pre><code data-highlight="javascript">${escapeHtml(example)}</code></pre>
    </article>
  `;
}

function renderLogView(): string {
  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2>Execution Log</h2>
          <p class="muted">Recent bookmarklet runs and bridge methods from the last 7 days. POST bodies are never stored.</p>
        </div>
        <button id="clearLogs" class="button inline">Clear Log</button>
      </div>
      ${
        state.logs.length > 0
          ? state.logs.map((entry) => renderLogItem(entry)).join("")
          : `<div class="list-item empty-state">
              <strong>No recent log entries.</strong>
              <div class="muted">Run a bookmarklet through the bridge to populate this view.</div>
            </div>`
      }
    </section>
  `;
}

function renderBookmarkScanner(): string {
  const statusMarkup = bookmarkScannerStatus
    ? `<div class="status ${bookmarkScannerStatus.tone}">${escapeHtml(bookmarkScannerStatus.message)}</div>`
    : "";

  return `
    <section class="panel">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2>Bookmark Scanner</h2>
          <p class="muted">Scan your browser bookmarks for bridge-compatible bookmarklets that use <code>window.BookmarkletBridge.run(...)</code>.</p>
        </div>
        <button id="scanBookmarks" class="button inline pastel-sky">Scan Bookmarks</button>
      </div>
      ${statusMarkup}
    </section>
    <section class="panel">
      <h3>Detected Bookmarklets</h3>
      <p class="muted">${scannedBookmarklets.length} compatible bookmarklet${scannedBookmarklets.length === 1 ? "" : "s"} found in the current scan.</p>
      ${
        scannedBookmarklets.length > 0
          ? scannedBookmarklets
              .map(
                (entry) => `
                  <div class="list-item">
                    <div class="row" style="justify-content:space-between; align-items:flex-start; gap:16px;">
                      <div>
                        <strong>${escapeHtml(entry.name)}</strong>
                        <div class="muted">Version ${entry.version} • Bridge Global</div>
                        <div class="muted">Bookmark: ${escapeHtml(entry.bookmarkTitle)}</div>
                        <div class="muted">Location: ${escapeHtml(entry.location)}</div>
                      </div>
                    </div>
                    <div style="margin-top:10px;">${entry.description ? `<div class="markdown-body">${renderMarkdown(entry.description)}</div>` : `<div class="muted">No extended description declared.</div>`}</div>
                    <div class="row" style="margin-top:10px;">
                      <button class="button inline pastel-gold" data-edit-generator="${escapeAttr(entry.location)}">Edit in Generator</button>
                    </div>
                  </div>
                `
              )
              .join("")
          : `<div class="list-item empty-state">
              <strong>No compatible bookmarklets found yet.</strong>
              <div class="muted">Run a scan to search your bookmarks for bridge-global bookmarklets.</div>
            </div>`
      }
    </section>
  `;
}

function renderLogItem(entry: ExecutionLogEntry): string {
  const summary = buildLogSummary(entry);
  return `
    <div class="list-item">
      <strong>${escapeHtml(summary.title)}</strong>
      <div class="muted">${escapeHtml(entry.timestamp)} • ${escapeHtml(entry.executionId)}</div>
      <div class="muted">${escapeHtml(summary.subtitle)}</div>
    </div>
  `;
}

function buildLogSummary(entry: ExecutionLogEntry): { title: string; subtitle: string } {
  if (entry.kind === "execution") {
    const name = entry.bookmarkletName ?? "Unknown bookmarklet";
    const version = entry.bookmarkletVersion !== undefined ? ` v${entry.bookmarkletVersion}` : "";
    return {
      title: `${entry.outcome === "allowed" ? "Execution allowed" : "Execution denied"}: ${name}${version}`,
      subtitle: `action=${entry.action ?? "register"}`
    };
  }

  const bits = [`action=${entry.action ?? "unknown"}`, `outcome=${entry.outcome}`];
  if (entry.url) {
    bits.push(`url=${entry.url}`);
  }
  if (entry.text) {
    bits.push(`text=${entry.text}`);
  }
  if (entry.filename) {
    bits.push(`filename=${entry.filename}`);
  }
  if (entry.sizeBytes !== undefined) {
    bits.push(`bytes=${String(entry.sizeBytes)}`);
  }
  if (entry.mimeType) {
    bits.push(`mimeType=${entry.mimeType}`);
  }
  if (entry.status !== undefined) {
    bits.push(`status=${String(entry.status)}`);
  }
  if (entry.errorCode) {
    bits.push(`error=${entry.errorCode}`);
  }
  return {
    title: `Bridge ${entry.action ?? "action"}`,
    subtitle: bits.join(" • ")
  };
}

function renderChips(values: string[] | undefined): string {
  const normalized = values ?? [];
  if (normalized.length === 0) {
    return '<span class="chip">none detected</span>';
  }
  return normalized.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
}

function renderNumericInputAttributes(
  min: number | undefined,
  max: number | undefined,
  step: number | undefined
): string {
  return [min !== undefined ? `min="${min}"` : "", max !== undefined ? `max="${max}"` : "", step !== undefined ? `step="${step}"` : ""]
    .filter(Boolean)
    .join(" ");
}

function formatSettingValue(value: BookmarkletSettingScalarValue): string {
  return typeof value === "string" ? value : String(value);
}

function getPolicySettingsSchema(definitionHash: string): BookmarkletSettingsSchema | undefined {
  return state.bookmarkletSettingsSchemas[definitionHash];
}

function collectPolicySettingsValues(definitionHash: string): BookmarkletSettingsValues | null {
  const schema = getPolicySettingsSchema(definitionHash);
  if (!schema) {
    return null;
  }

  const values: BookmarkletSettingsValues = {};
  for (const [key, definition] of Object.entries(schema)) {
    const input = document.querySelector<HTMLElement>(
      `[data-setting-input="${CSS.escape(key)}"][data-definition-hash="${CSS.escape(definitionHash)}"]`
    );
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) {
      values[key] = definition.default;
      continue;
    }

    switch (definition.type) {
      case "boolean":
        values[key] = input instanceof HTMLInputElement ? input.checked : Boolean(input.textContent);
        break;
      case "text":
        values[key] = input.value;
        break;
      case "integer": {
        const parsed = Number(input.value);
        values[key] = Number.isFinite(parsed) ? Math.trunc(parsed) : definition.default;
        break;
      }
      case "float": {
        const parsed = Number(input.value);
        values[key] = Number.isFinite(parsed) ? parsed : definition.default;
        break;
      }
      case "option":
        values[key] = input.value;
        break;
    }
  }

  return values;
}

function resetPolicySettingControl(definitionHash: string, key: string, definition: BookmarkletSettingDefinition): void {
  const input = document.querySelector<HTMLElement>(
    `[data-setting-input="${CSS.escape(key)}"][data-definition-hash="${CSS.escape(definitionHash)}"]`
  );
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) {
    return;
  }

  switch (definition.type) {
    case "boolean":
      if (input instanceof HTMLInputElement) {
        input.checked = definition.default;
      }
      break;
    case "text":
      input.value = definition.default;
      break;
    case "integer":
    case "float":
    case "option":
      input.value = String(definition.default);
      break;
  }
}

async function savePolicySettings(definitionHash: string): Promise<void> {
  const values = collectPolicySettingsValues(definitionHash);
  if (!values) {
    policySettingsStatus = {
      definitionHash,
      tone: "error",
      message: "Unable to collect bookmarklet settings."
    };
    return;
  }

  try {
    unwrapInternalResponse(
      await browser.runtime.sendMessage({
        kind: INTERNAL_MESSAGE_KIND.SAVE_BOOKMARKLET_SETTINGS_VALUES,
        definitionHash,
        values
      })
    );
    policySettingsStatus = {
      definitionHash,
      tone: "success",
      message: "Bookmarklet settings saved."
    };
    await refresh();
  } catch (error) {
    policySettingsStatus = {
      definitionHash,
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to save bookmarklet settings."
    };
    render();
  }
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function promptForEncryptionKey(mode: "export" | "import"): string | null {
  const key = window.prompt(
    mode === "export"
      ? "Enter an encryption key for this backup export."
      : "Enter the encryption key for this backup import."
  );
  if (!key || !key.trim()) {
    return null;
  }

  if (mode === "export") {
    const confirmation = window.prompt("Confirm the encryption key.");
    if (confirmation !== key) {
      settingsStatus = {
        tone: "error",
        message: "Encryption key confirmation did not match."
      };
      render();
      return null;
    }
  }

  return key;
}

function buildBackupFilename(exportedAt: string): string {
  return `bookmarklet-bridge-backup-${exportedAt.replaceAll(":", "-")}.json`;
}

function unwrapInternalResponse<T>(value: unknown): T {
  if (isBridgeResponse(value) && !value.ok) {
    throw new Error(value.error.message);
  }
  return value as T;
}

async function exportEncryptedConfiguration(): Promise<void> {
  const key = promptForEncryptionKey("export");
  if (!key) {
    return;
  }

  try {
    const payload = buildConfigurationExport(state);
    const encrypted = await encryptConfigurationExport(payload, key);
    downloadText(buildBackupFilename(payload.exportedAt), JSON.stringify(encrypted, null, 2));
    settingsStatus = {
      tone: "success",
      message: `Encrypted backup exported for ${payload.approvedPolicies.length} approved bookmarklet${payload.approvedPolicies.length === 1 ? "" : "s"}.`
    };
    render();
  } catch (error) {
    settingsStatus = {
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to export encrypted backup."
    };
    render();
  }
}

async function importEncryptedConfigurationFromFile(file: File): Promise<void> {
  const key = promptForEncryptionKey("import");
  if (!key) {
    return;
  }

  try {
    const rawText = await file.text();
    const encrypted = parseEncryptedConfigurationExport(JSON.parse(rawText) as unknown);
    const payload = await decryptConfigurationExport(encrypted, key);
    const result = unwrapInternalResponse<{ importedApprovedPolicies?: number }>(
      await browser.runtime.sendMessage({
        kind: INTERNAL_MESSAGE_KIND.IMPORT_CONFIGURATION,
        payload
      })
    );
    settingsStatus = {
      tone: "success",
      message: `Imported backup from ${encrypted.exportedAt} with ${result.importedApprovedPolicies ?? payload.approvedPolicies.length} approved bookmarklet${(result.importedApprovedPolicies ?? payload.approvedPolicies.length) === 1 ? "" : "s"}.`
    };
    selectedPolicyHash = null;
    selectedPolicyScreen = "detail";
    await refresh();
  } catch (error) {
    settingsStatus = {
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to import encrypted backup."
    };
    render();
  }
}

async function scanBookmarksForBridgeBookmarklets(): Promise<void> {
  try {
    const tree = await browser.bookmarks.getTree();
    scannedBookmarklets = scanBookmarkTreeForBridgeBookmarklets(tree);
    bookmarkScannerStatus = {
      tone: "success",
      message: `Scan finished. Found ${scannedBookmarklets.length} compatible bookmarklet${scannedBookmarklets.length === 1 ? "" : "s"}.`
    };
    render();
  } catch (error) {
    bookmarkScannerStatus = {
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to scan bookmarks."
    };
    render();
  }
}

function populateGeneratorFromScanResult(entry: BridgeBookmarkletScanResult): void {
  generatorDraft = {
    name: entry.name || defaultGeneratorDraft.name,
    version: Number.isFinite(entry.version) && entry.version > 0 ? Math.floor(entry.version) : defaultGeneratorDraft.version,
    extendedDescription: entry.description,
    settingsText: entry.settingsText || "{}",
    runBody: entry.runBody || ""
  };
  formatGeneratorDraft();
  persistGeneratorDraft();
  currentView = "generator";
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPolicyHash = null;
      selectedPolicyScreen = "detail";
      policySettingsStatus = null;
      currentView = button.dataset.view as ViewName;
      render();
    });
  });

  document.getElementById("saveSettings")?.addEventListener("click", async () => {
    const settings: BridgeSettings = {
      allowedOrigins: (document.getElementById("allowedOrigins") as HTMLTextAreaElement).value
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      requestDefaults: {
        timeoutMs: Number((document.getElementById("timeoutMs") as HTMLInputElement).value)
      },
      toastDefaults: {
        durationMs: Number((document.getElementById("toastDurationMs") as HTMLInputElement).value)
      }
    };
    try {
      unwrapInternalResponse(await browser.runtime.sendMessage({ kind: INTERNAL_MESSAGE_KIND.SAVE_SETTINGS, settings }));
      settingsStatus = {
        tone: "success",
        message: "Global bridge settings saved."
      };
      await refresh();
    } catch (error) {
      settingsStatus = {
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save global bridge settings."
      };
      render();
    }
  });

  document.getElementById("exportEncryptedConfiguration")?.addEventListener("click", () => {
    void exportEncryptedConfiguration();
  });

  document.getElementById("importEncryptedConfiguration")?.addEventListener("click", () => {
    (document.getElementById("importEncryptedConfigurationFile") as HTMLInputElement | null)?.click();
  });

  document.getElementById("importEncryptedConfigurationFile")?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    void importEncryptedConfigurationFromFile(file);
  });

  document.getElementById("clearLogs")?.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ kind: INTERNAL_MESSAGE_KIND.CLEAR_LOGS });
    await refresh();
  });

  document.getElementById("scanBookmarks")?.addEventListener("click", () => {
    void scanBookmarksForBridgeBookmarklets();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-edit-generator]").forEach((button) => {
    button.addEventListener("click", () => {
      const location = button.dataset.editGenerator;
      const entry = scannedBookmarklets.find((candidate) => candidate.location === location);
      if (!entry) {
        return;
      }
      populateGeneratorFromScanResult(entry);
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-open-policy]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPolicyHash = button.dataset.openPolicy ?? null;
      selectedPolicyScreen = "detail";
      policySettingsStatus = null;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-open-policy-settings]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPolicyHash = button.dataset.openPolicySettings ?? null;
      selectedPolicyScreen = "settings";
      policySettingsStatus = null;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-set-decision]").forEach((button) => {
    button.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        kind: INTERNAL_MESSAGE_KIND.SET_POLICY_DECISION,
        definitionHash: button.dataset.setDecision,
        decision: button.dataset.nextDecision
      });
      await refresh();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-delete-policy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        kind: INTERNAL_MESSAGE_KIND.DELETE_POLICY,
        definitionHash: button.dataset.deletePolicy
      });
      selectedPolicyHash = null;
      selectedPolicyScreen = "detail";
      policySettingsStatus = null;
      await refresh();
    });
  });

  document.querySelector("[data-close-detail]")?.addEventListener("click", () => {
    selectedPolicyHash = null;
    selectedPolicyScreen = "detail";
    policySettingsStatus = null;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copyValue ?? "");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-save-policy-settings]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.savePolicySettings) {
        await savePolicySettings(button.dataset.savePolicySettings);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-reset-setting]").forEach((button) => {
    button.addEventListener("click", async () => {
      const definitionHash = button.dataset.definitionHash;
      const key = button.dataset.resetSetting;
      const schema = definitionHash ? getPolicySettingsSchema(definitionHash) : undefined;
      const definition = key && schema ? schema[key] : undefined;
      if (!definitionHash || !key || !definition) {
        return;
      }
      resetPolicySettingControl(definitionHash, key, definition);
      await savePolicySettings(definitionHash);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-reset-all-settings]").forEach((button) => {
    button.addEventListener("click", async () => {
      const definitionHash = button.dataset.resetAllSettings;
      const schema = definitionHash ? getPolicySettingsSchema(definitionHash) : undefined;
      if (!definitionHash || !schema) {
        return;
      }
      for (const [key, definition] of Object.entries(schema)) {
        resetPolicySettingControl(definitionHash, key, definition);
      }
      await savePolicySettings(definitionHash);
    });
  });

  bindGeneratorEvents();
}

function bindGeneratorEvents(): void {
  const nameInput = document.getElementById("genName") as HTMLInputElement | null;
  const versionInput = document.getElementById("genVersion") as HTMLInputElement | null;
  const extendedDescriptionInput = document.getElementById("genExtendedDescription") as HTMLTextAreaElement | null;
  const settingsTextInput = document.getElementById("genSettingsText") as HTMLTextAreaElement | null;
  const runBodyInput = document.getElementById("genRunBody") as HTMLTextAreaElement | null;

  [nameInput, versionInput, extendedDescriptionInput, settingsTextInput, runBodyInput].forEach((input) => {
    input?.addEventListener("input", () => {
      syncGeneratorDraftFromDom();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-snippet]").forEach((button) => {
    button.addEventListener("click", () => {
      const snippet = buildSnippet(button.dataset.snippet as GeneratorSnippet);
      insertIntoGenerator(snippet);
    });
  });

  document.getElementById("resetGeneratorDraft")?.addEventListener("click", () => {
    generatorDraft = { ...defaultGeneratorDraft };
    generatorFormatStatus = null;
    persistGeneratorDraft();
    render();
  });

  document.getElementById("generateBookmarklet")?.addEventListener("click", () => {
    syncGeneratorDraftFromDom();
    generatorFormatStatus = null;
    render();
  });

  document.getElementById("prettyPrintGenerator")?.addEventListener("click", () => {
    syncGeneratorDraftFromDom();
    formatGeneratorDraft();
    render();
  });

  document.getElementById("copyGeneratorSource")?.addEventListener("click", async () => {
    syncGeneratorDraftFromDom();
    const buildResult = buildGeneratorOutput(generatorDraft);
    await navigator.clipboard.writeText(buildResult.fullSource);
  });

  document.getElementById("copyGeneratorBookmarklet")?.addEventListener("click", async () => {
    syncGeneratorDraftFromDom();
    const buildResult = buildGeneratorOutput(generatorDraft);
    if (!buildResult.error) {
      await navigator.clipboard.writeText(buildResult.bookmarkletUrl);
    }
  });
}

function loadGeneratorDraft(): GeneratorDraft {
  try {
    const raw = window.localStorage.getItem(GENERATOR_DRAFT_STORAGE_KEY);
    if (!raw) {
      return { ...defaultGeneratorDraft };
    }
    const parsed = JSON.parse(raw) as Partial<GeneratorDraft>;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : defaultGeneratorDraft.name,
      version:
        typeof parsed.version === "number" && Number.isFinite(parsed.version) && parsed.version > 0
          ? Math.floor(parsed.version)
          : defaultGeneratorDraft.version,
      extendedDescription:
        typeof parsed.extendedDescription === "string" ? parsed.extendedDescription : defaultGeneratorDraft.extendedDescription,
      settingsText:
        typeof parsed.settingsText === "string" ? parsed.settingsText : defaultGeneratorDraft.settingsText,
      runBody: typeof parsed.runBody === "string" && parsed.runBody ? parsed.runBody : defaultGeneratorDraft.runBody
    };
  } catch {
    return { ...defaultGeneratorDraft };
  }
}

function persistGeneratorDraft(): void {
  window.localStorage.setItem(GENERATOR_DRAFT_STORAGE_KEY, JSON.stringify(generatorDraft));
}

function syncGeneratorDraftFromDom(): void {
  const name = (document.getElementById("genName") as HTMLInputElement | null)?.value.trim();
  const versionValue = Number((document.getElementById("genVersion") as HTMLInputElement | null)?.value);
  const extendedDescription = (document.getElementById("genExtendedDescription") as HTMLTextAreaElement | null)?.value ?? "";
  const settingsText = (document.getElementById("genSettingsText") as HTMLTextAreaElement | null)?.value ?? "";
  const runBody = (document.getElementById("genRunBody") as HTMLTextAreaElement | null)?.value ?? "";

  generatorDraft = {
    name: name || defaultGeneratorDraft.name,
    version: Number.isFinite(versionValue) && versionValue > 0 ? Math.floor(versionValue) : defaultGeneratorDraft.version,
    extendedDescription,
    settingsText,
    runBody
  };
  persistGeneratorDraft();
}

function writeGeneratorDraftToDom(): void {
  const nameInput = document.getElementById("genName") as HTMLInputElement | null;
  const versionInput = document.getElementById("genVersion") as HTMLInputElement | null;
  const extendedDescriptionInput = document.getElementById("genExtendedDescription") as HTMLTextAreaElement | null;
  const settingsTextInput = document.getElementById("genSettingsText") as HTMLTextAreaElement | null;
  const runBodyInput = document.getElementById("genRunBody") as HTMLTextAreaElement | null;

  if (nameInput) {
    nameInput.value = generatorDraft.name;
  }
  if (versionInput) {
    versionInput.value = String(generatorDraft.version);
  }
  if (extendedDescriptionInput) {
    extendedDescriptionInput.value = generatorDraft.extendedDescription;
  }
  if (settingsTextInput) {
    settingsTextInput.value = generatorDraft.settingsText;
  }
  if (runBodyInput) {
    runBodyInput.value = generatorDraft.runBody;
  }
}

function formatGeneratorDraft(): void {
  const formattedSettings = formatGeneratorSettingsText(generatorDraft.settingsText);
  generatorDraft = {
    ...generatorDraft,
    settingsText: formattedSettings.text,
    runBody: formatGeneratorJavaScript(generatorDraft.runBody)
  };
  persistGeneratorDraft();
  writeGeneratorDraftToDom();
  generatorFormatStatus = formattedSettings.error
    ? {
        tone: "error",
        message: `Pretty print formatted JavaScript but could not format settings JSON: ${formattedSettings.error}`
      }
    : {
        tone: "success",
        message: "Pretty print updated the JavaScript and settings JSON."
      };
}

function buildSnippet(snippet: GeneratorSnippet): string {
  switch (snippet) {
    case "toast":
      return `await bridge.toast("Step finished", {\n  variant: "success",\n  durationMs: 2200\n});`;
    case "get":
      return `const result = await bridge.get("https://example.com/api/me", {\n  headers: {\n    Accept: "application/json"\n  }\n});\nconsole.log(result);`;
    case "post":
      return `const result = await bridge.post("https://example.com/api/items", {\n  title: document.title,\n  url: location.href,\n  selection: window.getSelection ? String(window.getSelection()).trim() : ""\n}, {\n  headers: {\n    "Content-Type": "application/json"\n  }\n});\nconsole.log(result);`;
    case "download":
      return `await bridge.download({\n  filename: "page-notes.md",\n  content: [\n    "# " + (document.title || "Untitled"),\n    "",\n    location.href,\n    "",\n    window.getSelection ? String(window.getSelection()).trim() : ""\n  ].join("\\n"),\n  mimeType: "text/markdown"\n});`;
    case "downloadUrl":
      return `await bridge.downloadUrl({\n  url: "https://example.com/files/report.pdf",\n  filename: "report.pdf"\n});`;
    case "copyText":
      return `await bridge.copyText([\n  document.title || "Untitled",\n  location.href,\n  "",\n  window.getSelection ? String(window.getSelection()).trim() : ""\n].filter(Boolean).join("\\n"));`;
    case "tryCatch":
      return `try {\n  // bridge calls here\n} catch (error) {\n  console.error(error);\n  await bridge.toast(error instanceof Error ? error.message : "Bookmarklet failed", {\n    variant: "error",\n    durationMs: 3200\n  });\n}`;
  }
}

function insertIntoGenerator(snippet: string): void {
  const textarea = document.getElementById("genRunBody") as HTMLTextAreaElement | null;
  if (!textarea) {
    return;
  }
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prefix = start > 0 && !textarea.value.slice(0, start).endsWith("\n") ? "\n" : "";
  const suffix = end < textarea.value.length && !textarea.value.slice(end).startsWith("\n") ? "\n" : "";
  textarea.setRangeText(`${prefix}${snippet}${suffix}`, start, end, "end");
  textarea.focus();
  syncGeneratorDraftFromDom();
}

async function refresh(): Promise<void> {
  await loadState();
  render();
}

function applyHighlighting(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-highlight]").forEach((element) => {
    const language = element.dataset.highlight === "json" ? "json" : "javascript";
    highlightIntoElement(element, language);
  });
}

function ensureHighlightTheme(): void {
  if (document.getElementById("bookmarklet-bridge-highlight-theme")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "bookmarklet-bridge-highlight-theme";
  style.textContent = HIGHLIGHT_THEME;
  document.head.append(style);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

void refresh();
