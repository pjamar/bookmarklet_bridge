import { APPROVAL_DECISIONS, APPROVAL_HOST_ID, INTERNAL_MESSAGE_KIND } from "../shared/constants";
import { HIGHLIGHT_THEME, highlightIntoElement } from "../shared/highlight";
import type { ApprovalDecision, BridgeResponse, RegisterMessage } from "../shared/types";

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
  const details = !input.response.ok && input.response.error.details && typeof input.response.error.details === "object"
    ? (input.response.error.details as Record<string, unknown>)
    : {};
  const approval = (details.approval as Record<string, unknown> | undefined) ?? {};
  const bookmarklet = (details.bookmarklet as Record<string, unknown> | undefined) ?? {};
  const inferredActions = Array.isArray(approval.inferredActions) ? approval.inferredActions as string[] : [];

  return new Promise<BridgeResponse>((resolve) => {
    shadow.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 12, 18, 0.46);
        z-index: 2147483647;
        display: grid;
        place-items: center;
        font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .panel {
        width: min(880px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: #f7f2e8;
        color: #1b1b1b;
        border: 1px solid #cabaa3;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        padding: 20px;
      }
      .meta { display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; margin-bottom: 16px; }
      .label { font-weight: 700; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip {
        border: 1px solid #cabaa3;
        border-radius: 999px;
        padding: 3px 8px;
        background: #fffdf8;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        background: #fffdf8;
        border: 1px solid #d8ccb9;
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
        background: #1f4b3f;
        color: white;
      }
      button[data-decision="deny"] { background: #7b2d26; }
      ${HIGHLIGHT_THEME}
    `;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <h1>Bookmarklet Approval Required</h1>
      <p>This bookmarklet wants to use Bookmarklet Bridge.</p>
      <div class="meta">
        <div class="label">Name</div><div>${escapeHtml(String(bookmarklet.name ?? input.message.bookmarklet.name))}</div>
        <div class="label">Version</div><div>${escapeHtml(String(bookmarklet.version ?? input.message.bookmarklet.version))}</div>
        <div class="label">Definition Hash</div><div>${escapeHtml(String(approval.definitionHash ?? ""))}</div>
        <div class="label">Source Hash</div><div>${escapeHtml(String(approval.sourceHash ?? ""))}</div>
        <div class="label">Inferred Actions</div><div class="chips">${inferredActions.map((action) => `<span class="chip">${escapeHtml(action)}</span>`).join("") || "<span class=\"chip\">none detected</span>"}</div>
      </div>
      <p><strong>Source</strong></p>
      <pre><code data-highlight="javascript">${escapeHtml(String(approval.decodedSource ?? ""))}</code></pre>
      <div class="actions"></div>
    `;

    panel.querySelectorAll<HTMLElement>("[data-highlight]").forEach((element) => {
      highlightIntoElement(element, "javascript");
    });

    const actions = panel.querySelector(".actions") as HTMLDivElement;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
