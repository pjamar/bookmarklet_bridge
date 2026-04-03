import { afterEach, describe, expect, test, vi } from "vitest";
import { BridgeError } from "../../../src/shared/errors";
import { handleCopyText } from "../../../src/background/actions/clipboard";

const writeTextMock = vi.fn();

vi.stubGlobal("navigator", {
  clipboard: {
    writeText: writeTextMock
  }
});

afterEach(() => {
  writeTextMock.mockReset();
});

describe("handleCopyText", () => {
  test("writes text to the clipboard and returns byte size", async () => {
    writeTextMock.mockResolvedValue(undefined);

    const result = await handleCopyText({
      namespace: "bookmarklet-bridge",
      version: 2,
      kind: "action",
      requestId: "req-copy",
      executionId: "exec-1",
      action: "copyText",
      payload: {
        text: "hello"
      }
    });

    expect(writeTextMock).toHaveBeenCalledWith("hello");
    expect(result).toEqual({
      copied: true,
      sizeBytes: 5
    });
  });

  test("wraps clipboard failures in a bridge error", async () => {
    writeTextMock.mockRejectedValue(new Error("clipboard blocked"));

    await expect(
      handleCopyText({
        namespace: "bookmarklet-bridge",
        version: 2,
        kind: "action",
        requestId: "req-copy-fail",
        executionId: "exec-1",
        action: "copyText",
        payload: {
          text: "hello"
        }
      })
    ).rejects.toThrowError(new BridgeError("clipboard_write_failed", "The browser could not write to the clipboard."));
  });
});
