import { describe, expect, test } from "vitest";
import {
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  MAX_CLIPBOARD_TEXT_BYTES,
  MAX_DOWNLOAD_BYTES,
  MAX_HEADERS
} from "../../src/shared/constants";
import { BridgeError } from "../../src/shared/errors";
import { parseBridgeMessage } from "../../src/shared/schema";

describe("parseBridgeMessage", () => {
  test("accepts a valid register message", () => {
    expect(
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "register",
        requestId: "req-1",
        executionId: "exec-1",
        bookmarklet: {
          name: "Example",
          version: 1,
          source: "async function run() {}",
          extendedDescription: "## What it does\n\n- Saves text"
        }
      })
    ).toEqual({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      kind: "register",
      requestId: "req-1",
      executionId: "exec-1",
      bookmarklet: {
        name: "Example",
        version: 1,
        source: "async function run() {}",
        extendedDescription: "## What it does\n\n- Saves text"
      }
    });
  });

  test("rejects blank bookmarklet extended descriptions", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "register",
        requestId: "req-extended-description",
        executionId: "exec-1",
        bookmarklet: {
          name: "Example",
          version: 1,
          source: "async function run() {}",
          extendedDescription: "   "
        }
      })
    ).toThrowError(new BridgeError("invalid_request", "bookmarklet.extendedDescription must be a non-empty string."));
  });

  test("rejects messages with the wrong namespace", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: "wrong-namespace",
        version: BRIDGE_VERSION,
        kind: "register",
        requestId: "req-1",
        executionId: "exec-1",
        bookmarklet: {
          name: "Example",
          version: 1,
          source: "async function run() {}"
        }
      })
    ).toThrowError(new BridgeError("invalid_request", "Invalid bridge namespace."));
  });

  test("rejects GET actions with a body", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-2",
        executionId: "exec-1",
        action: "get",
        payload: {
          url: "https://example.com",
          body: { bad: true }
        }
      })
    ).toThrowError(new BridgeError("invalid_request", "GET requests cannot include a body."));
  });

  test("rejects non-json post bodies", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-3",
        executionId: "exec-1",
        action: "post",
        payload: {
          url: "https://example.com",
          body: { when: new Date("2026-04-02T00:00:00.000Z") }
        }
      })
    ).toThrowError(new BridgeError("invalid_request", "payload.body must be JSON-serializable."));
  });

  test("rejects too many headers", () => {
    const headers = Object.fromEntries(
      Array.from({ length: MAX_HEADERS + 1 }, (_, index) => [`X-Test-${index}`, String(index)])
    );

    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-4",
        executionId: "exec-1",
        action: "post",
        payload: {
          url: "https://example.com",
          headers
        }
      })
    ).toThrowError(new BridgeError("invalid_request", "Too many headers."));
  });

  test("accepts a valid download action", () => {
    expect(
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-download",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "notes.md",
          content: "# Saved",
          mimeType: "text/markdown"
        }
      })
    ).toEqual({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      kind: "action",
      requestId: "req-download",
      executionId: "exec-1",
      action: "download",
      payload: {
        filename: "notes.md",
        content: "# Saved",
        mimeType: "text/markdown"
      }
    });
  });

  test("rejects oversized download content", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-download-too-large",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "notes.md",
          content: "x".repeat(MAX_DOWNLOAD_BYTES + 1)
        }
      })
    ).toThrowError(new BridgeError("payload_too_large", "download payload is too large."));
  });

  test("accepts a valid binary download action", () => {
    expect(
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-download-binary",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "pixel.png",
          bytesBase64: "AQIDBA==",
          mimeType: "image/png"
        }
      })
    ).toEqual({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      kind: "action",
      requestId: "req-download-binary",
      executionId: "exec-1",
      action: "download",
      payload: {
        filename: "pixel.png",
        bytesBase64: "AQIDBA==",
        mimeType: "image/png"
      }
    });
  });

  test("rejects download payloads that specify both text and base64 bytes", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-download-ambiguous",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "notes.txt",
          content: "hello",
          bytesBase64: "aGVsbG8="
        }
      })
    ).toThrowError(
      new BridgeError("invalid_request", "payload must include exactly one of payload.content or payload.bytesBase64.")
    );
  });

  test("accepts a valid downloadUrl action", () => {
    expect(
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-download-url",
        executionId: "exec-1",
        action: "downloadUrl",
        payload: {
          url: "https://example.com/files/report.pdf",
          filename: "report.pdf"
        }
      })
    ).toEqual({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      kind: "action",
      requestId: "req-download-url",
      executionId: "exec-1",
      action: "downloadUrl",
      payload: {
        url: "https://example.com/files/report.pdf",
        filename: "report.pdf"
      }
    });
  });

  test("accepts a valid copyText action", () => {
    expect(
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-copy",
        executionId: "exec-1",
        action: "copyText",
        payload: {
          text: "Copied text"
        }
      })
    ).toEqual({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      kind: "action",
      requestId: "req-copy",
      executionId: "exec-1",
      action: "copyText",
      payload: {
        text: "Copied text"
      }
    });
  });

  test("rejects oversized clipboard text", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-copy-too-large",
        executionId: "exec-1",
        action: "copyText",
        payload: {
          text: "x".repeat(MAX_CLIPBOARD_TEXT_BYTES + 1)
        }
      })
    ).toThrowError(new BridgeError("payload_too_large", "payload.text is too large."));
  });

  test("rejects unsupported actions", () => {
    expect(() =>
      parseBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        kind: "action",
        requestId: "req-5",
        executionId: "exec-1",
        action: "delete",
        payload: {
          url: "https://example.com"
        }
      })
    ).toThrowError(new BridgeError("unsupported_action", "Unsupported action: delete."));
  });
});
