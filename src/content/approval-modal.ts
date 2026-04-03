import { APPROVAL_DECISIONS, APPROVAL_HOST_ID, INTERNAL_MESSAGE_KIND, SETTINGS_STORAGE_KEY } from "../shared/constants";
import { formatGeneratorJavaScript } from "../shared/generator-format";
import { HIGHLIGHT_THEME, highlightIntoElement } from "../shared/highlight";
import { renderMarkdown } from "../shared/markdown";
import type {
  ApprovalDecision,
  BookmarkletSettingDefinition,
  BookmarkletSettingsSchema,
  BridgeResponse,
  RegisterMessage
} from "../shared/types";

interface ApprovalPromptInput {
  message: RegisterMessage;
  response: BridgeResponse;
}

function ensureRoot(): ShadowRoot {
  let host = document.getElementById(APPROVAL_HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = APPROVAL_HOST_ID;
    document.documentElement.append(host);
  }
  return host.shadowRoot ?? host.attachShadow({ mode: "open" });
}

export async function promptForApproval(input: ApprovalPromptInput): Promise<BridgeResponse> {
  const shadow = ensureRoot();
  const storedSettings = (await browser.storage.local.get(SETTINGS_STORAGE_KEY))[SETTINGS_STORAGE_KEY] as
    | { themeMode?: string }
    | undefined;
  const themeMode =
    storedSettings?.themeMode === "light" || storedSettings?.themeMode === "dark" ? storedSettings.themeMode : "active";
  shadow.host.dataset.themeMode = themeMode;
  const details = !input.response.ok && input.response.error.details && typeof input.response.error.details === "object"
    ? (input.response.error.details as Record<string, unknown>)
    : {};
  const approval = (details.approval as Record<string, unknown> | undefined) ?? {};
  const bookmarklet = (details.bookmarklet as Record<string, unknown> | undefined) ?? {};
  const inferredActions = Array.isArray(approval.inferredActions) ? approval.inferredActions as string[] : [];

  return new Promise<BridgeResponse>((resolve) => {
    shadow.replaceChildren();

    const style = document.createElement("style");
    style.textContent = `
      :host {
        color-scheme: light dark;
        --bg: #e9e7e2;
        --paper: #f8f7f4;
        --paper-strong: #fcfbf8;
        --ink: #22211f;
        --muted: #706b63;
        --line: #c8c1b7;
        --accent: #2e6664;
        --accent-strong: #234d4c;
        --danger: #a56a43;
        --overlay: rgba(15, 19, 24, 0.48);
        --code-ink: #23211e;
        --code-comment: #7b756e;
        --code-keyword: #9a5734;
        --code-number: #8c6a2a;
        --code-string: #2d6a66;
        --code-function: #3b5f8e;
        --code-property: #74608d;
        --code-punctuation: #6f6962;
        --code-built-in: #356a4d;
        --code-deletion: #9b4f44;
        --code-meta: #705f4d;
      }
      :host([data-theme-mode="light"]) {
        color-scheme: light;
      }
      :host([data-theme-mode="dark"]) {
        color-scheme: dark;
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --bg: #1a1f24;
          --paper: #20272d;
          --paper-strong: #263038;
          --ink: #e7e2db;
          --muted: #ada69d;
          --line: #3a474f;
          --accent: #79a7a5;
          --accent-strong: #9dc2c1;
          --danger: #c48b63;
          --overlay: rgba(4, 7, 11, 0.68);
          --code-ink: #e7e2db;
          --code-comment: #8e9a96;
          --code-keyword: #d3976d;
          --code-number: #d0b26b;
          --code-string: #89c3bb;
          --code-function: #93b5dd;
          --code-property: #b4a0d1;
          --code-punctuation: #9b958d;
          --code-built-in: #8dc09d;
          --code-deletion: #d6887a;
          --code-meta: #b79c7f;
        }
      }
      :host([data-theme-mode="light"]) {
        --bg: #e9e7e2;
        --paper: #f8f7f4;
        --paper-strong: #fcfbf8;
        --ink: #22211f;
        --muted: #706b63;
        --line: #c8c1b7;
        --accent: #2e6664;
        --accent-strong: #234d4c;
        --danger: #a56a43;
        --overlay: rgba(15, 19, 24, 0.48);
        --code-ink: #23211e;
        --code-comment: #7b756e;
        --code-keyword: #9a5734;
        --code-number: #8c6a2a;
        --code-string: #2d6a66;
        --code-function: #3b5f8e;
        --code-property: #74608d;
        --code-punctuation: #6f6962;
        --code-built-in: #356a4d;
        --code-deletion: #9b4f44;
        --code-meta: #705f4d;
      }
      :host([data-theme-mode="dark"]) {
        --bg: #1a1f24;
        --paper: #20272d;
        --paper-strong: #263038;
        --ink: #e7e2db;
        --muted: #ada69d;
        --line: #3a474f;
        --accent: #79a7a5;
        --accent-strong: #9dc2c1;
        --danger: #c48b63;
        --overlay: rgba(4, 7, 11, 0.68);
        --code-ink: #e7e2db;
        --code-comment: #8e9a96;
        --code-keyword: #d3976d;
        --code-number: #d0b26b;
        --code-string: #89c3bb;
        --code-function: #93b5dd;
        --code-property: #b4a0d1;
        --code-punctuation: #9b958d;
        --code-built-in: #8dc09d;
        --code-deletion: #d6887a;
        --code-meta: #b79c7f;
      }
      .overlay {
        position: fixed;
        inset: 0;
        background: var(--overlay);
        z-index: 2147483647;
        display: grid;
        place-items: center;
        font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .panel {
        width: min(880px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: var(--paper);
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        padding: 20px;
      }
      .meta { display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; margin-bottom: 16px; }
      .label { font-weight: 700; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 3px 8px;
        background: var(--paper-strong);
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        background: var(--paper-strong);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
      }
      code {
        font: inherit;
      }
      .actions { display: flex; gap: 10px; margin-top: 16px; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        cursor: pointer;
        font: inherit;
        background: var(--accent);
        color: white;
      }
      button[data-decision="deny"] { background: var(--danger); }
      .markdown {
        margin: 0 0 16px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--paper-strong);
      }
      .markdown :is(h1, h2, h3) { margin: 0 0 10px; }
      .markdown p { margin: 0 0 10px; }
      .markdown ul { margin: 0 0 10px 18px; padding: 0; }
      .markdown blockquote {
        margin: 0 0 10px;
        padding-left: 12px;
        border-left: 3px solid var(--line);
        color: var(--muted);
      }
      .markdown pre {
        margin: 0 0 10px;
      }
      .markdown a { color: var(--accent-strong); }
      ${HIGHLIGHT_THEME}
    `;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const panel = document.createElement("div");
    panel.className = "panel";
    const heading = document.createElement("h1");
    heading.textContent = "Bookmarklet Approval Required";

    const intro = document.createElement("p");
    intro.textContent = "This bookmarklet wants to use Bookmarklet Bridge.";

    const extendedDescription = String(bookmarklet.extendedDescription ?? "");
    const descriptionBlock =
      extendedDescription.trim().length > 0 ? document.createElement("section") : null;
    if (descriptionBlock) {
      descriptionBlock.className = "markdown";
      descriptionBlock.innerHTML = renderMarkdown(extendedDescription);
    }

    const settingsSchema = isSettingsSchema(bookmarklet.settings) ? bookmarklet.settings : undefined;
    const settingsBlock =
      settingsSchema && Object.keys(settingsSchema).length > 0
        ? createSettingsBlock(settingsSchema)
        : null;

    const meta = document.createElement("div");
    meta.className = "meta";
    appendMetaRow(meta, "Name", String(bookmarklet.name ?? input.message.bookmarklet.name));
    appendMetaRow(meta, "Version", String(bookmarklet.version ?? input.message.bookmarklet.version));
    appendMetaRow(meta, "Definition Hash", String(approval.definitionHash ?? ""));
    appendMetaRow(meta, "Source Hash", String(approval.sourceHash ?? ""));

    const inferredActionsLabel = document.createElement("div");
    inferredActionsLabel.className = "label";
    inferredActionsLabel.textContent = "Inferred Actions";
    const inferredActionsValue = document.createElement("div");
    inferredActionsValue.className = "chips";
    for (const action of inferredActions) {
      inferredActionsValue.append(createChip(action));
    }
    if (inferredActions.length === 0) {
      inferredActionsValue.append(createChip("none detected"));
    }
    meta.append(inferredActionsLabel, inferredActionsValue);

    const sourceLabel = document.createElement("p");
    const sourceStrong = document.createElement("strong");
    sourceStrong.textContent = "Source";
    sourceLabel.append(sourceStrong);

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.dataset.highlight = "javascript";
    code.textContent = formatGeneratorJavaScript(String(approval.decodedSource ?? ""));
    pre.append(code);

    const actions = document.createElement("div");
    actions.className = "actions";

    panel.append(heading, intro);
    if (descriptionBlock) {
      panel.append(descriptionBlock);
    }
    if (settingsBlock) {
      panel.append(settingsBlock);
    }
    panel.append(meta, sourceLabel, pre, actions);

    panel.querySelectorAll<HTMLElement>("[data-highlight]").forEach((element) => {
      highlightIntoElement(element, "javascript");
    });

    for (const decision of APPROVAL_DECISIONS) {
      const button = document.createElement("button");
      button.dataset.decision = decision;
      button.textContent = decision === "allow" ? "Allow" : "Deny";
      button.addEventListener("click", async () => {
        const result = (await browser.runtime.sendMessage({
          kind: INTERNAL_MESSAGE_KIND.APPROVAL_DECISION,
          decision,
          message: input.message
        })) as BridgeResponse;
        resolve(result);
        shadow.host.remove();
      });
      actions.append(button);
    }

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) {
        return;
      }
      resolve({
        namespace: input.response.namespace,
        version: input.response.version,
        requestId: input.message.requestId,
        ok: false,
        error: {
          code: "approval_dismissed",
          message: "Bookmarklet approval was dismissed."
        }
      });
      shadow.host.remove();
    });

    overlay.append(panel);
    shadow.append(style, overlay);
  });
}

function appendMetaRow(container: HTMLElement, label: string, value: string): void {
  const labelNode = document.createElement("div");
  labelNode.className = "label";
  labelNode.textContent = label;

  const valueNode = document.createElement("div");
  valueNode.textContent = value;

  container.append(labelNode, valueNode);
}

function createChip(value: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = value;
  return chip;
}

function isSettingsSchema(value: unknown): value is BookmarkletSettingsSchema {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createSettingsBlock(schema: BookmarkletSettingsSchema): HTMLElement {
  const block = document.createElement("section");
  block.className = "markdown";

  const heading = document.createElement("h2");
  heading.textContent = "Declared Settings";
  block.append(heading);

  const intro = document.createElement("p");
  intro.textContent = "This bookmarklet declares user-visible settings. Defaults below are what it can read through bridge.getSettings().";
  block.append(intro);

  for (const [key, definition] of Object.entries(schema)) {
    block.append(createSettingCard(key, definition));
  }

  return block;
}

function createSettingCard(key: string, definition: BookmarkletSettingDefinition): HTMLElement {
  const card = document.createElement("div");
  card.style.marginBottom = "12px";
  card.style.padding = "12px 14px";
  card.style.border = "1px solid #d8ccb9";
  card.style.borderRadius = "10px";
  card.style.background = "#fffdf8";

  const title = document.createElement("p");
  title.innerHTML = `<strong>${escapeHtml(definition.label)}</strong> <code>${escapeHtml(key)}</code>`;

  const details = document.createElement("p");
  details.textContent = `${definition.description} Type: ${definition.type}. Default: ${formatSettingValue(definition.default)}.`;

  card.append(title, details);
  if (definition.type === "option") {
    const options = document.createElement("p");
    options.textContent = `Options: ${definition.options.join(", ")}`;
    card.append(options);
  }
  return card;
}

function formatSettingValue(value: string | number | boolean): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
