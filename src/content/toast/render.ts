import {
  APPROVAL_HOST_ID,
  DEFAULT_TOAST_DURATION_MS,
  MAX_TOAST_DURATION_MS,
  MIN_TOAST_DURATION_MS,
  TOAST_HOST_ID
} from "../../shared/constants";
import type { ToastPayload } from "../../shared/types";

function ensureShadowHost(id: string) {
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    document.documentElement.append(host);
  }
  return host.shadowRoot ?? host.attachShadow({ mode: "open" });
}

export function showToast(payload: ToastPayload): void {
  const shadow = ensureShadowHost(TOAST_HOST_ID);

  let style = shadow.getElementById("styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "styles";
    style.textContent = `
      :host { all: initial; }
      .stack {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 2147483647;
        font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .toast {
        max-width: 360px;
        border-radius: 12px;
        padding: 12px 14px;
        color: white;
        box-shadow: 0 12px 28px rgba(0,0,0,0.25);
        transform: translateY(-8px);
        opacity: 0;
        transition: opacity 140ms ease, transform 140ms ease;
      }
      .toast[data-visible="true"] {
        transform: translateY(0);
        opacity: 1;
      }
      .toast[data-variant="success"] { background: #155e3a; }
      .toast[data-variant="info"] { background: #1d4f91; }
      .toast[data-variant="error"] { background: #922b21; }
    `;
    shadow.append(style);
  }

  let stack = shadow.querySelector(".stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "stack";
    shadow.append(stack);
  }

  const node = document.createElement("div");
  node.className = "toast";
  node.dataset.variant = payload.variant ?? "info";
  node.textContent = payload.message;
  stack.append(node);

  requestAnimationFrame(() => {
    node.dataset.visible = "true";
  });

  const duration = Math.min(
    MAX_TOAST_DURATION_MS,
    Math.max(MIN_TOAST_DURATION_MS, Math.round(payload.durationMs ?? DEFAULT_TOAST_DURATION_MS))
  );

  setTimeout(() => {
    node.dataset.visible = "false";
    setTimeout(() => node.remove(), 180);
  }, duration);
}

export function clearApprovalUi(): void {
  document.getElementById(APPROVAL_HOST_ID)?.remove();
}
