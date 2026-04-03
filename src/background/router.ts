import { BRIDGE_NAMESPACE, BRIDGE_VERSION } from "../shared/constants";
import { BridgeError, createErrorResponse, ensureNever, isBridgeError } from "../shared/errors";
import type {
  ActionMessage,
  ApprovalContext,
  BridgeMessage,
  BridgeResponse,
  JsonValue,
  BridgeState,
  InternalMessage,
  MessageSenderContext,
  RegisterMessage
} from "../shared/types";
import { parseBridgeMessage } from "../shared/schema";
import { handleGet } from "./actions/get";
import { handlePost } from "./actions/post";
import { handleDownload, handleDownloadUrl } from "./actions/download";
import { handleCopyText } from "./actions/clipboard";
import { getSettings, saveSettings } from "./config/store";
import { appendLog, clearLogs, listLogs } from "./log/store";
import {
  applyApprovalDecision,
  ensureAllowed,
  getApprovalRequirement,
  registerApprovedExecution
} from "./policy/approval";
import { buildIdentity } from "./policy/hash";
import { deletePolicy, listPolicies, updatePolicyDecision } from "./policy/store";
import { getExecutionSession, hasExecutionSession } from "./policy/session-store";

function createSuccessResponse(
  requestId: string,
  result: JsonValue | { [key: string]: JsonValue }
): BridgeResponse {
  return {
    namespace: BRIDGE_NAMESPACE,
    version: BRIDGE_VERSION,
    requestId,
    ok: true,
    result
  };
}

async function executeAction(message: ActionMessage, sender: MessageSenderContext): Promise<BridgeResponse> {
  const settings = await getSettings();
  const session = await getExecutionSession(sender.tabId, message.executionId);
  switch (message.action) {
    case "post": {
      const result = await handlePost(message, settings);
      await appendLog({
        id: `${message.requestId}:post`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "post",
        url: message.payload.url,
        status: typeof result.status === "number" ? result.status : undefined
      });
      return createSuccessResponse(message.requestId, result);
    }
    case "get": {
      const result = await handleGet(message, settings);
      await appendLog({
        id: `${message.requestId}:get`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "get",
        url: message.payload.url,
        status: typeof result.status === "number" ? result.status : undefined
      });
      return createSuccessResponse(message.requestId, result);
    }
    case "toast": {
      const result = {
        shown: true,
        payload: {
          message: message.payload.message,
          variant: message.payload.variant ?? "info",
          durationMs: message.payload.durationMs ?? settings.toastDefaults.durationMs
        }
      };
      await appendLog({
        id: `${message.requestId}:toast`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "toast",
        text: message.payload.message
      });
      return createSuccessResponse(message.requestId, result);
    }
    case "download": {
      const result = await handleDownload(message);
      await appendLog({
        id: `${message.requestId}:download`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "download",
        filename: result.filename,
        sizeBytes: result.sizeBytes,
        mimeType: result.mimeType
      });
      return createSuccessResponse(message.requestId, result);
    }
    case "downloadUrl": {
      const result = await handleDownloadUrl(message, settings);
      await appendLog({
        id: `${message.requestId}:download-url`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "downloadUrl",
        url: result.url,
        filename: result.filename
      });
      return createSuccessResponse(message.requestId, result);
    }
    case "copyText": {
      const result = await handleCopyText(message);
      await appendLog({
        id: `${message.requestId}:copy-text`,
        timestamp: new Date().toISOString(),
        executionId: message.executionId,
        bookmarkletName: session?.bookmarkletName,
        bookmarkletVersion: session?.bookmarkletVersion,
        kind: "action",
        outcome: "success",
        action: "copyText",
        sizeBytes: result.sizeBytes
      });
      return createSuccessResponse(message.requestId, result);
    }
    default:
      ensureNever(message);
  }
}

async function handleRegisterMessage(
  message: RegisterMessage,
  sender: MessageSenderContext
): Promise<BridgeResponse> {
  const identityShape = await buildIdentity(message.bookmarklet);
  const identity: ApprovalContext = {
    ...identityShape,
    executionId: message.executionId
  };

  const approval = await getApprovalRequirement(identity);
  if (approval === "prompt") {
    return createErrorResponse(
      message.requestId,
      "approval_required",
      "Bookmarklet approval is required.",
      {
        approval: identity,
        bookmarklet: {
          name: message.bookmarklet.name,
          version: message.bookmarklet.version,
          extendedDescription: message.bookmarklet.extendedDescription
        }
      }
    );
  }

  ensureAllowed(approval);
  await registerApprovedExecution(identity, sender, message.bookmarklet);
  await appendLog({
    id: `${message.requestId}:register`,
    timestamp: new Date().toISOString(),
    executionId: message.executionId,
    bookmarkletName: message.bookmarklet.name,
    bookmarkletVersion: message.bookmarklet.version,
    kind: "execution",
    outcome: "allowed",
    action: "register"
  });
  return createSuccessResponse(message.requestId, { registered: true });
}

async function ensureExecutionRegistered(message: ActionMessage, sender: MessageSenderContext): Promise<void> {
  if (!(await hasExecutionSession(sender.tabId, message.executionId))) {
    throw new BridgeError(
      "invalid_request",
      "Bookmarklet must register successfully before issuing bridge actions."
    );
  }
}

async function handleBridgeMessage(
  message: BridgeMessage,
  sender: MessageSenderContext
): Promise<BridgeResponse> {
  if (message.kind === "register") {
    return handleRegisterMessage(message, sender);
  }
  await ensureExecutionRegistered(message, sender);
  return executeAction(message, sender);
}

async function handleApprovalDecision(
  message: RegisterMessage,
  decision: "allow" | "deny",
  sender: MessageSenderContext
): Promise<BridgeResponse> {
  const identityShape = await buildIdentity(message.bookmarklet);
  const identity: ApprovalContext = {
    ...identityShape,
    executionId: message.executionId
  };
  const approval = await applyApprovalDecision(decision, message.bookmarklet, identity, sender);
  if (approval === "deny") {
    await appendLog({
      id: `${message.requestId}:register-denied`,
      timestamp: new Date().toISOString(),
      executionId: message.executionId,
      bookmarkletName: message.bookmarklet.name,
      bookmarkletVersion: message.bookmarklet.version,
      kind: "execution",
      outcome: "denied",
      action: "register"
    });
  } else {
    await appendLog({
      id: `${message.requestId}:register-allowed`,
      timestamp: new Date().toISOString(),
      executionId: message.executionId,
      bookmarkletName: message.bookmarklet.name,
      bookmarkletVersion: message.bookmarklet.version,
      kind: "execution",
      outcome: "allowed",
      action: "register"
    });
  }
  ensureAllowed(approval);
  await registerApprovedExecution(identity, sender, message.bookmarklet);
  return createSuccessResponse(message.requestId, { registered: true });
}

export async function handleInternalMessage(
  message: InternalMessage,
  sender: MessageSenderContext
): Promise<BridgeResponse | BridgeState | unknown> {
  switch (message.kind) {
    case "bridge_message":
      return handleBridgeMessage(parseBridgeMessage(message.message), sender);
    case "approval_decision":
      return handleApprovalDecision(message.message, message.decision, sender);
    case "get_state":
      return {
        settings: await getSettings(),
        policies: await listPolicies(),
        logs: await listLogs()
      };
    case "save_settings":
      return saveSettings(message.settings);
    case "set_policy_decision":
      return updatePolicyDecision(message.definitionHash, message.decision);
    case "delete_policy":
      return deletePolicy(message.definitionHash);
    case "clear_logs":
      return clearLogs();
    default:
      throw new BridgeError("bridge_internal_error", "Unsupported internal message.");
  }
}

export async function wrapInternalMessage(
  message: InternalMessage,
  sender: MessageSenderContext
): Promise<unknown> {
  try {
    return await handleInternalMessage(message, sender);
  } catch (error) {
    if (isBridgeError(error)) {
      if ("message" in message && message.message && message.message.kind === "action") {
        const actionMessage = message.message;
        const session = await getExecutionSession(sender.tabId, actionMessage.executionId);
        await appendLog({
          id: `${actionMessage.requestId}:error`,
          timestamp: new Date().toISOString(),
          executionId: actionMessage.executionId,
          bookmarkletName: session?.bookmarkletName,
          bookmarkletVersion: session?.bookmarkletVersion,
          kind: "action",
          outcome: "error",
          action: actionMessage.action,
          url: "url" in actionMessage.payload ? actionMessage.payload.url : undefined,
          text: actionMessage.action === "toast" ? actionMessage.payload.message : undefined,
          filename:
            actionMessage.action === "download" || actionMessage.action === "downloadUrl"
              ? actionMessage.payload.filename
              : undefined,
          mimeType: actionMessage.action === "download" ? actionMessage.payload.mimeType : undefined,
          sizeBytes:
            actionMessage.action === "copyText"
              ? new TextEncoder().encode(actionMessage.payload.text).length
              : actionMessage.action === "download"
                ? actionMessage.payload.content !== undefined
                  ? new TextEncoder().encode(actionMessage.payload.content).length
                  : undefined
                : undefined,
          errorCode: error.code
        });
      } else if ("message" in message && message.message && message.message.kind === "register" && error.code === "denied") {
        const registerMessage = message.message;
        await appendLog({
          id: `${registerMessage.requestId}:register-denied-policy`,
          timestamp: new Date().toISOString(),
          executionId: registerMessage.executionId,
          bookmarkletName: registerMessage.bookmarklet.name,
          bookmarkletVersion: registerMessage.bookmarklet.version,
          kind: "execution",
          outcome: "denied",
          action: "register",
          errorCode: error.code
        });
      }
      const requestId =
        "message" in message && message.message
          ? message.message.requestId
          : "internal-message";
      return createErrorResponse(requestId, error.code, error.message, error.details);
    }
    return createErrorResponse("internal-message", "bridge_internal_error", "Internal bridge error.");
  }
}
