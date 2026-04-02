export const BRIDGE_NAMESPACE = "bookmarklet-bridge";
export const BRIDGE_VERSION = 2;
export const SETTINGS_STORAGE_KEY = "bridge_settings";
export const POLICIES_STORAGE_KEY = "bridge_policies";
export const LOG_STORAGE_KEY = "bridge_logs";
export const EXECUTION_SESSIONS_STORAGE_KEY = "bridge_execution_sessions";
export const LOG_RETENTION_DAYS = 7;
export const MAX_LOG_ENTRIES = 500;
export const MAX_HEADERS = 20;
export const MAX_BODY_BYTES = 256 * 1024;
export const DEFAULT_TIMEOUT_MS = 10000;
export const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 30000;
export const DEFAULT_TOAST_DURATION_MS = 2200;
export const MIN_TOAST_DURATION_MS = 1000;
export const MAX_TOAST_DURATION_MS = 10000;
export const TOAST_HOST_ID = "bookmarklet-bridge-toast-host";
export const APPROVAL_HOST_ID = "bookmarklet-bridge-approval-host";
export const INTERNAL_MESSAGE_KIND = {
  BRIDGE_MESSAGE: "bridge_message",
  APPROVAL_DECISION: "approval_decision",
  GET_STATE: "get_state",
  SAVE_SETTINGS: "save_settings",
  SET_POLICY_DECISION: "set_policy_decision",
  DELETE_POLICY: "delete_policy",
  CLEAR_LOGS: "clear_logs"
} as const;

export const ACTIONS = ["post", "get", "toast"] as const;
export const TOAST_VARIANTS = ["success", "info", "error"] as const;
export const APPROVAL_DECISIONS = ["allow", "deny"] as const;
