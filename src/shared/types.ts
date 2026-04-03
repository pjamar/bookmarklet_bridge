import type { ACTIONS, APPROVAL_DECISIONS, INTERNAL_MESSAGE_KIND, TOAST_VARIANTS } from "./constants";

export type BridgeAction = (typeof ACTIONS)[number];
export type ToastVariant = (typeof TOAST_VARIANTS)[number];
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BookmarkletRegistration {
  name: string;
  version: number;
  source: string;
}

export interface RegisterMessage {
  namespace: string;
  version: number;
  kind: "register";
  requestId: string;
  executionId: string;
  bookmarklet: BookmarkletRegistration;
}

export interface ActionMessageBase {
  namespace: string;
  version: number;
  kind: "action";
  requestId: string;
  executionId: string;
}

export interface PostPayload {
  url: string;
  headers?: Record<string, string>;
  body?: JsonValue;
}

export interface GetPayload {
  url: string;
  headers?: Record<string, string>;
}

export interface ToastPayload {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface DownloadPayload {
  filename: string;
  content?: string;
  bytesBase64?: string;
  mimeType?: string;
}

export interface DownloadUrlPayload {
  url: string;
  filename?: string;
}

export interface ClipboardPayload {
  text: string;
}

export interface PostActionMessage extends ActionMessageBase {
  action: "post";
  payload: PostPayload;
}

export interface GetActionMessage extends ActionMessageBase {
  action: "get";
  payload: GetPayload;
}

export interface ToastActionMessage extends ActionMessageBase {
  action: "toast";
  payload: ToastPayload;
}

export interface DownloadActionMessage extends ActionMessageBase {
  action: "download";
  payload: DownloadPayload;
}

export interface ClipboardActionMessage extends ActionMessageBase {
  action: "copyText";
  payload: ClipboardPayload;
}

export interface DownloadUrlActionMessage extends ActionMessageBase {
  action: "downloadUrl";
  payload: DownloadUrlPayload;
}

export type ActionMessage =
  | PostActionMessage
  | GetActionMessage
  | ToastActionMessage
  | DownloadActionMessage
  | DownloadUrlActionMessage
  | ClipboardActionMessage;
export type BridgeMessage = RegisterMessage | ActionMessage;

export interface BridgeSuccessResponse {
  namespace: string;
  version: number;
  requestId: string;
  ok: true;
  result: JsonValue | { [key: string]: JsonValue };
}

export interface BridgeErrorDetail {
  code: string;
  message: string;
  details?: JsonValue;
}

export interface BridgeErrorResponse {
  namespace: string;
  version: number;
  requestId: string;
  ok: false;
  error: BridgeErrorDetail;
}

export type BridgeResponse = BridgeSuccessResponse | BridgeErrorResponse;

export interface ApprovalContext {
  definitionHash: string;
  sourceHash: string;
  canonicalBookmarklet: string;
  decodedSource: string;
  inferredActions: BridgeAction[];
  executionId: string;
}

export interface MessageSenderContext {
  tabId?: number;
}

export interface PolicyEntry {
  definitionHash: string;
  sourceHash: string;
  canonicalBookmarklet: string;
  name: string;
  version: number;
  decision: "allow" | "deny";
  inferredActions: BridgeAction[];
  decodedSource: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  executionId: string;
  bookmarkletName?: string;
  bookmarkletVersion?: number;
  kind: "execution" | "action";
  outcome: "allowed" | "denied" | "success" | "error";
  action?: BridgeAction | "register";
  url?: string;
  text?: string;
  filename?: string;
  sizeBytes?: number;
  mimeType?: string;
  status?: number;
  errorCode?: string;
}

export interface BridgeSettings {
  allowedOrigins: string[];
  toastDefaults: {
    durationMs: number;
  };
  requestDefaults: {
    timeoutMs: number;
  };
}

export interface BridgeState {
  settings: BridgeSettings;
  policies: PolicyEntry[];
  logs: ExecutionLogEntry[];
}

export interface BridgeMessageEnvelope {
  kind: typeof INTERNAL_MESSAGE_KIND.BRIDGE_MESSAGE;
  message: BridgeMessage;
}

export interface ApprovalDecisionMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.APPROVAL_DECISION;
  decision: ApprovalDecision;
  message: RegisterMessage;
}

export interface GetStateMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.GET_STATE;
}

export interface SaveSettingsMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.SAVE_SETTINGS;
  settings: BridgeSettings;
}

export interface SetPolicyDecisionMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.SET_POLICY_DECISION;
  definitionHash: string;
  decision: "allow" | "deny";
}

export interface DeletePolicyMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.DELETE_POLICY;
  definitionHash: string;
}

export interface ClearLogsMessage {
  kind: typeof INTERNAL_MESSAGE_KIND.CLEAR_LOGS;
}

export type InternalMessage =
  | BridgeMessageEnvelope
  | ApprovalDecisionMessage
  | GetStateMessage
  | SaveSettingsMessage
  | SetPolicyDecisionMessage
  | DeletePolicyMessage
  | ClearLogsMessage;
