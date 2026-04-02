import { BridgeError } from "../../shared/errors";
import type { BridgeSettings, GetPayload, JsonValue, PostPayload } from "../../shared/types";

function validateOrigin(url: URL, allowedOrigins: string[]): void {
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
    throw new BridgeError("origin_not_allowed", `Origin ${url.origin} is not allowed by extension settings.`);
  }
}

export function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const forbidden = new Set([
    "host",
    "content-length",
    "origin",
    "referer",
    "cookie",
    "set-cookie"
  ]);

  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => !forbidden.has(key.toLowerCase()))
  );
}

function parseResponseBody(contentType: string | null, text: string): JsonValue {
  if (!text) {
    return null;
  }
  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}

export async function executeJsonRequest(
  method: "GET" | "POST",
  payload: GetPayload | PostPayload,
  settings: BridgeSettings
): Promise<{ status: number; headers: Record<string, string>; data: JsonValue }> {
  let url: URL;
  try {
    url = new URL(payload.url);
  } catch {
    throw new BridgeError("invalid_request", "payload.url must be a valid full URL.");
  }

  validateOrigin(url, settings.allowedOrigins);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.requestDefaults.timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: sanitizeHeaders(payload.headers),
      body:
        method === "POST" && "body" in payload && payload.body !== undefined
          ? JSON.stringify(payload.body)
          : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      status: response.status,
      headers,
      data: parseResponseBody(response.headers.get("content-type"), text)
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new BridgeError("timeout", "Network request timed out.");
    }
    throw new BridgeError("network_error", "Network request failed.");
  } finally {
    clearTimeout(timeout);
  }
}
