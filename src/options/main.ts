import { INTERNAL_MESSAGE_KIND } from "../shared/constants";
import { HIGHLIGHT_THEME, highlightIntoElement } from "../shared/highlight";
import { renderMarkdown } from "../shared/markdown";
import type { BridgeSettings, BridgeState, ExecutionLogEntry, PolicyEntry } from "../shared/types";

type ViewName = "settings" | "approved" | "denied" | "log" | "generator";
type GeneratorSnippet = "toast" | "get" | "post" | "download" | "downloadUrl" | "copyText" | "tryCatch";

interface GeneratorDraft {
  name: string;
  version: number;
  extendedDescription: string;
  runBody: string;
}

interface GeneratorBuildResult {
  runSource: string;
  fullSource: string;
  bookmarkletUrl: string;
  error: string | null;
}

let state: BridgeState = {
  settings: {
    allowedOrigins: [],
    toastDefaults: { durationMs: 2200 },
    requestDefaults: { timeoutMs: 10000 }
  },
  policies: [],
  logs: []
};
let currentView: ViewName = "settings";
let selectedPolicyHash: string | null = null;
const GENERATOR_DRAFT_STORAGE_KEY = "bookmarklet-bridge.generator-draft";
const defaultGeneratorDraft: GeneratorDraft = {
  name: "My Bookmarklet",
  version: 1,
  extendedDescription: "",
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
    logs: loaded.logs ?? []
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
        <p class="muted">Review bookmarklet source, manage bridge policy, and generate bookmarklets with the simplified helper API.</p>
        <div class="row" style="margin: 0 0 16px;">
          <a class="button inline pastel-sage" href="api-reference.html" target="_blank" rel="noopener noreferrer">Open API Reference</a>
        </div>
        <nav>
          ${navButton("settings", "Bridge Settings")}
          ${navButton("approved", "Approved")}
          ${navButton("denied", "Denied")}
          ${navButton("log", "Log")}
          ${navButton("generator", "Generator")}
        </nav>
      </aside>
      <main>${selectedPolicy ? renderPolicyDetail(selectedPolicy) : renderView(currentView)}</main>
    </div>
  `;
  app.replaceChildren(createFragmentFromHtml(markup));

  applyHighlighting(app);
  bindEvents();
}

function createFragmentFromHtml(markup: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const fragment = document.createDocumentFragment();
  fragment.append(...parsed.body.childNodes);
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
    case "generator":
      return renderGenerator();
  }
}

function renderSettings(): string {
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
        <button id="saveSettings" class="button inline">Save Settings</button>
      </div>
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
  `;
}

function renderGenerator(): string {
  const buildResult = buildGeneratorOutput(generatorDraft);
  const buildStatus = buildResult.error
    ? `<div class="status error">Build failed: ${escapeHtml(buildResult.error)}</div>`
    : `<div class="status success">Bundle ready. Edit the code, then rebuild to refresh the bookmarklet URL.</div>`;

  return `
    <section class="panel">
      <h2>Bookmarklet IDE</h2>
      <p class="muted">Write the body of <code>run(bridge)</code>. The extension helper, registration flow, and bridge transport are injected automatically.</p>
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
          <button id="resetGeneratorDraft" class="button inline pastel-rose">Reset Example</button>
          <button id="copyGeneratorSource" class="button inline pastel-gold">Copy Bundle Source</button>
          <button id="copyGeneratorBookmarklet" class="button inline pastel-blue">Copy Bookmarklet URL</button>
        </div>
        ${buildStatus}
      </div>
    </section>
    <section class="panel">
      <h3>Bridge Actions</h3>
      <div class="doc-grid">
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
      <p class="muted">The helper already handles registration, execution ids, request ids, and <code>window.postMessage</code>. Keep bookmarklet logic inside <code>run(bridge)</code>.</p>
    </section>
    <section class="panel">
      <h3>Readable Source</h3>
      <p class="muted">This is the source that approval and inspect views focus on.</p>
      <pre><code id="generatorSource" data-highlight="javascript">${escapeHtml(buildResult.runSource)}</code></pre>
    </section>
    <section class="panel">
      <h3>Full Bundle</h3>
      <p class="muted">This is the helper-wrapped source that becomes the bookmarklet payload.</p>
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

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPolicyHash = null;
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
    await browser.runtime.sendMessage({ kind: INTERNAL_MESSAGE_KIND.SAVE_SETTINGS, settings });
    await refresh();
  });

  document.getElementById("clearLogs")?.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ kind: INTERNAL_MESSAGE_KIND.CLEAR_LOGS });
    await refresh();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-open-policy]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPolicyHash = button.dataset.openPolicy ?? null;
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
      await refresh();
    });
  });

  document.querySelector("[data-close-detail]")?.addEventListener("click", () => {
    selectedPolicyHash = null;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copyValue ?? "");
    });
  });

  bindGeneratorEvents();
}

function buildHelperSource(): string {
  return `const BRIDGE_NAMESPACE = "bookmarklet-bridge";
const BRIDGE_VERSION = 2;

function bridgeSend(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Bridge response timed out."));
    }, 15000);

    function onMessage(event) {
      const data = event.data;
      if (
        !data ||
        data.namespace !== BRIDGE_NAMESPACE ||
        data.requestId !== message.requestId ||
        typeof data.ok !== "boolean"
      ) {
        return;
      }
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!data.ok) {
        reject(new Error(data.error && data.error.message ? data.error.message : "Bridge request failed."));
        return;
      }
      resolve(data.result);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(message, "*");
  });
}

async function runBookmarklet({ name, version, extendedDescription, run }) {
  const executionId = crypto.randomUUID ? crypto.randomUUID() : "execution-" + String(Date.now());
  await bridgeSend({
    namespace: BRIDGE_NAMESPACE,
    version: BRIDGE_VERSION,
    kind: "register",
    requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-register",
    executionId,
    bookmarklet: {
      name,
      version,
      source: run.toString(),
      extendedDescription
    }
  });

  const bridge = {
    post(url, body, options = {}) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-post",
        executionId,
        action: "post",
        payload: {
          url,
          body,
          headers: options.headers
        }
      });
    },
    get(url, options = {}) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-get",
        executionId,
        action: "get",
        payload: {
          url,
          headers: options.headers
        }
      });
    },
    toast(message, options = {}) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-toast",
        executionId,
        action: "toast",
        payload: {
          message,
          variant: options.variant,
          durationMs: options.durationMs
        }
      });
    },
    download(options) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-download",
        executionId,
        action: "download",
        payload: {
          filename: options.filename,
          content: options.content,
          bytesBase64: options.bytesBase64,
          mimeType: options.mimeType
        }
      });
    },
    downloadUrl(options) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-download-url",
        executionId,
        action: "downloadUrl",
        payload: {
          url: options.url,
          filename: options.filename
        }
      });
    },
    copyText(text) {
      return bridgeSend({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-copy-text",
        executionId,
        action: "copyText",
        payload: {
          text
        }
      });
    }
  };

  return run(bridge);
}`;
}

function bindGeneratorEvents(): void {
  const nameInput = document.getElementById("genName") as HTMLInputElement | null;
  const versionInput = document.getElementById("genVersion") as HTMLInputElement | null;
  const extendedDescriptionInput = document.getElementById("genExtendedDescription") as HTMLTextAreaElement | null;
  const runBodyInput = document.getElementById("genRunBody") as HTMLTextAreaElement | null;

  [nameInput, versionInput, extendedDescriptionInput, runBodyInput].forEach((input) => {
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
    persistGeneratorDraft();
    render();
  });

  document.getElementById("generateBookmarklet")?.addEventListener("click", () => {
    syncGeneratorDraftFromDom();
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
  const runBody = (document.getElementById("genRunBody") as HTMLTextAreaElement | null)?.value ?? "";

  generatorDraft = {
    name: name || defaultGeneratorDraft.name,
    version: Number.isFinite(versionValue) && versionValue > 0 ? Math.floor(versionValue) : defaultGeneratorDraft.version,
    extendedDescription,
    runBody
  };
  persistGeneratorDraft();
}

function buildGeneratorOutput(draft: GeneratorDraft): GeneratorBuildResult {
  const helperSource = buildHelperSource();
  const runSource = `async run(bridge) {\n${indentBlock(draft.runBody, 2)}\n}`;
  const fullSource = `(function () {\n${indentBlock(helperSource, 2)}\n\n  runBookmarklet({\n    name: ${JSON.stringify(draft.name)},\n    version: ${draft.version},\n    extendedDescription: ${JSON.stringify(draft.extendedDescription)},\n    ${runSource.replaceAll("\n", "\n    ")}\n  });\n})();`;
  return {
    runSource,
    fullSource,
    bookmarkletUrl: `javascript:${encodeURIComponent(fullSource)}`,
    error: null
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

function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
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
