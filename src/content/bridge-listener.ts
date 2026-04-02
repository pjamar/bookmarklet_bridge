import { BRIDGE_NAMESPACE, BRIDGE_VERSION, INTERNAL_MESSAGE_KIND } from "../shared/constants";
import { createErrorResponse, isBridgeResponse } from "../shared/errors";
import { isLikelyBridgeMessage } from "../shared/schema";
import type { BridgeMessage, BridgeResponse, RegisterMessage } from "../shared/types";
import { promptForApproval } from "./approval-modal";
import { showToast } from "./toast/render";

function postResponse(response: BridgeResponse): void {
  window.postMessage(response, "*");
}

async function handleBridgeMessage(rawMessage: unknown): Promise<void> {
  if (!isLikelyBridgeMessage(rawMessage)) {
    return;
  }

  const message = rawMessage as BridgeMessage;
  let response = (await browser.runtime.sendMessage({
    kind: INTERNAL_MESSAGE_KIND.BRIDGE_MESSAGE,
    message
  })) as BridgeResponse;

  if (!isBridgeResponse(response)) {
    response = createErrorResponse(
      "requestId" in message ? message.requestId : "internal-message",
      "bridge_internal_error",
      "Background script returned an invalid response."
    );
  }

  if (!response.ok && response.error.code === "approval_required" && message.kind === "register") {
    response = await promptForApproval({ message: message as RegisterMessage, response });
  }

  if (response.ok && message.kind === "action" && message.action === "toast") {
    const result = response.result as {
      payload?: { message: string; variant?: "success" | "info" | "error"; durationMs?: number };
    };
    if (result.payload) {
      showToast(result.payload);
    }
  }

  postResponse(response);
}

export function installBridgeListener(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const data = event.data as Record<string, unknown> | undefined;
    if (!data || data.namespace !== BRIDGE_NAMESPACE || data.version !== BRIDGE_VERSION) {
      return;
    }
    void handleBridgeMessage(event.data);
  });
}
