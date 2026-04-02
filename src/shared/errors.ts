import { BRIDGE_NAMESPACE, BRIDGE_VERSION } from "./constants";
import type { BridgeErrorResponse, BridgeResponse } from "./types";

export class BridgeError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function isBridgeError(error: unknown): error is BridgeError {
  return error instanceof BridgeError;
}

export function createErrorResponse(
  requestId: string,
  code: string,
  message: string,
  details?: unknown
): BridgeErrorResponse {
  return {
    namespace: BRIDGE_NAMESPACE,
    version: BRIDGE_VERSION,
    requestId,
    ok: false,
    error: {
      code,
      message,
      details: details as never
    }
  };
}

export function ensureNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function isBridgeResponse(value: unknown): value is BridgeResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "namespace" in value &&
      "version" in value &&
      "requestId" in value &&
      "ok" in value
  );
}
