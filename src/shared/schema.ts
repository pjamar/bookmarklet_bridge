import {
  ACTIONS,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  MAX_BODY_BYTES,
  MAX_CLIPBOARD_TEXT_BYTES,
  MAX_DOWNLOAD_BYTES,
  MAX_HEADERS,
  TOAST_VARIANTS
} from "./constants";
import { parseBookmarkletSettingsSchema } from "./bookmarklet-settings";
import { BridgeError } from "./errors";
import type {
  ActionMessage,
  BookmarkletRegistration,
  BridgeAction,
  BridgeMessage,
  GetPayload,
  JsonValue,
  PostPayload,
  RegisterMessage,
  ClipboardPayload,
  DownloadPayload,
  DownloadUrlPayload,
  ToastPayload
} from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value as number) || typeof value !== "number";
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError("invalid_request", `${field} must be a non-empty string.`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeError("invalid_request", `${field} must be a finite number.`);
  }
  return value;
}

function parseHeaders(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload.headers must be a plain object.");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_HEADERS) {
    throw new BridgeError("invalid_request", "Too many headers.");
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of entries) {
    if (typeof headerValue !== "string") {
      throw new BridgeError("invalid_request", `Header ${key} must be a string.`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

function parseBookmarklet(value: unknown): BookmarkletRegistration {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "bookmarklet must be a plain object.");
  }
  const extendedDescription = value.extendedDescription;
  if (
    extendedDescription !== undefined &&
    (typeof extendedDescription !== "string" || !extendedDescription.trim())
  ) {
    throw new BridgeError("invalid_request", "bookmarklet.extendedDescription must be a non-empty string.");
  }
  return {
    name: requireString(value.name, "bookmarklet.name"),
    version: requireNumber(value.version, "bookmarklet.version"),
    source: requireString(value.source, "bookmarklet.source"),
    extendedDescription: extendedDescription as string | undefined,
    settings: parseBookmarkletSettingsSchema(value.settings)
  };
}

function parsePostPayload(value: unknown): PostPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  const body = value.body;
  if (body !== undefined && !isJsonValue(body)) {
    throw new BridgeError("invalid_request", "payload.body must be JSON-serializable.");
  }
  if (body !== undefined && new TextEncoder().encode(JSON.stringify(body)).length > MAX_BODY_BYTES) {
    throw new BridgeError("payload_too_large", "payload.body is too large.");
  }
  return {
    url: requireString(value.url, "payload.url"),
    headers: parseHeaders(value.headers),
    body: body as JsonValue | undefined
  };
}

function parseGetPayload(value: unknown): GetPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  if ("body" in value) {
    throw new BridgeError("invalid_request", "GET requests cannot include a body.");
  }
  return {
    url: requireString(value.url, "payload.url"),
    headers: parseHeaders(value.headers)
  };
}

function parseToastPayload(value: unknown): ToastPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  const variant = value.variant;
  if (
    variant !== undefined &&
    (typeof variant !== "string" || !TOAST_VARIANTS.includes(variant as (typeof TOAST_VARIANTS)[number]))
  ) {
    throw new BridgeError("invalid_request", "payload.variant is invalid.");
  }
  const durationMs = value.durationMs;
  if (durationMs !== undefined && (typeof durationMs !== "number" || !Number.isFinite(durationMs))) {
    throw new BridgeError("invalid_request", "payload.durationMs must be a finite number.");
  }
  return {
    message: requireString(value.message, "payload.message"),
    variant: variant as ToastPayload["variant"],
    durationMs: durationMs as number | undefined
  };
}

function parseDownloadPayload(value: unknown): DownloadPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  const hasContent = value.content !== undefined;
  const hasBytesBase64 = value.bytesBase64 !== undefined;
  if (hasContent === hasBytesBase64) {
    throw new BridgeError("invalid_request", "payload must include exactly one of payload.content or payload.bytesBase64.");
  }
  const content = hasContent ? requireString(value.content, "payload.content") : undefined;
  const bytesBase64 = hasBytesBase64 ? requireString(value.bytesBase64, "payload.bytesBase64") : undefined;
  const measuredBytes =
    content !== undefined
      ? new TextEncoder().encode(content).length
      : estimateBase64ByteLength(bytesBase64 as string);
  if (measuredBytes > MAX_DOWNLOAD_BYTES) {
    throw new BridgeError("payload_too_large", "download payload is too large.");
  }
  const mimeType = value.mimeType;
  if (mimeType !== undefined && typeof mimeType !== "string") {
    throw new BridgeError("invalid_request", "payload.mimeType must be a string.");
  }
  return {
    filename: requireString(value.filename, "payload.filename"),
    content,
    bytesBase64,
    mimeType: mimeType as string | undefined
  };
}

function estimateBase64ByteLength(value: string): number {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new BridgeError("invalid_request", "payload.bytesBase64 must be valid base64.");
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function parseDownloadUrlPayload(value: unknown): DownloadUrlPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  const filename = value.filename;
  if (filename !== undefined && (typeof filename !== "string" || !filename.trim())) {
    throw new BridgeError("invalid_request", "payload.filename must be a non-empty string.");
  }
  return {
    url: requireString(value.url, "payload.url"),
    filename: filename as string | undefined
  };
}

function parseClipboardPayload(value: unknown): ClipboardPayload {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "payload must be a plain object.");
  }
  const text = requireString(value.text, "payload.text");
  if (new TextEncoder().encode(text).length > MAX_CLIPBOARD_TEXT_BYTES) {
    throw new BridgeError("payload_too_large", "payload.text is too large.");
  }
  return { text };
}

function parseActionMessage(value: Record<string, unknown>): ActionMessage {
  const action = requireString(value.action, "action") as BridgeAction;
  if (!ACTIONS.includes(action)) {
    throw new BridgeError("unsupported_action", `Unsupported action: ${action}.`);
  }

  const base = {
    namespace: requireString(value.namespace, "namespace"),
    version: requireNumber(value.version, "version"),
    kind: "action" as const,
    requestId: requireString(value.requestId, "requestId"),
    executionId: requireString(value.executionId, "executionId")
  };

  switch (action) {
    case "post":
      return { ...base, action, payload: parsePostPayload(value.payload) };
    case "get":
      return { ...base, action, payload: parseGetPayload(value.payload) };
    case "toast":
      return { ...base, action, payload: parseToastPayload(value.payload) };
    case "download":
      return { ...base, action, payload: parseDownloadPayload(value.payload) };
    case "downloadUrl":
      return { ...base, action, payload: parseDownloadUrlPayload(value.payload) };
    case "copyText":
      return { ...base, action, payload: parseClipboardPayload(value.payload) };
    case "getSettings":
      if (value.payload !== undefined) {
        throw new BridgeError("invalid_request", "getSettings does not accept a payload.");
      }
      return { ...base, action };
  }
}

export function parseBridgeMessage(value: unknown): BridgeMessage {
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "Message must be a plain object.");
  }

  const namespace = requireString(value.namespace, "namespace");
  if (namespace !== BRIDGE_NAMESPACE) {
    throw new BridgeError("invalid_request", "Invalid bridge namespace.");
  }

  const version = requireNumber(value.version, "version");
  if (version !== BRIDGE_VERSION) {
    throw new BridgeError("invalid_request", "Unsupported bridge version.");
  }

  const kind = requireString(value.kind, "kind");
  if (kind === "register") {
    const message: RegisterMessage = {
      namespace,
      version,
      kind: "register",
      requestId: requireString(value.requestId, "requestId"),
      executionId: requireString(value.executionId, "executionId"),
      bookmarklet: parseBookmarklet(value.bookmarklet)
    };
    return message;
  }

  if (kind === "action") {
    return parseActionMessage(value);
  }

  throw new BridgeError("invalid_request", `Unsupported message kind: ${kind}.`);
}

export function isLikelyBridgeMessage(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).namespace === BRIDGE_NAMESPACE &&
      (value as Record<string, unknown>).version === BRIDGE_VERSION
  );
}
