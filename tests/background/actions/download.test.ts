import { afterEach, describe, expect, test, vi } from "vitest";
import { BridgeError } from "../../../src/shared/errors";
import { handleDownload } from "../../../src/background/actions/download";

const downloadMock = vi.fn();
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();

vi.stubGlobal("browser", {
  downloads: {
    download: downloadMock
  }
});

vi.stubGlobal("URL", {
  createObjectURL: createObjectUrlMock,
  revokeObjectURL: revokeObjectUrlMock
});

afterEach(() => {
  downloadMock.mockReset();
  createObjectUrlMock.mockReset();
  revokeObjectUrlMock.mockReset();
});

describe("handleDownload", () => {
  test("sanitizes filenames and starts a browser download", async () => {
    createObjectUrlMock.mockReturnValue("blob:download-url");
    downloadMock.mockResolvedValue(17);

    const result = await handleDownload({
      namespace: "bookmarklet-bridge",
      version: 2,
      kind: "action",
      requestId: "req-1",
      executionId: "exec-1",
      action: "download",
      payload: {
        filename: " ../Report:April?.md ",
        content: "# Report",
        mimeType: "text/markdown"
      }
    });

    expect(downloadMock).toHaveBeenCalledWith({
      url: "blob:download-url",
      filename: "-Report-April-.md",
      conflictAction: "uniquify"
    });
    expect(result).toEqual({
      downloadId: 17,
      filename: "-Report-April-.md",
      mimeType: "text/markdown;charset=utf-8",
      sizeBytes: 8
    });
  });

  test("rejects filenames that sanitize to empty", async () => {
    await expect(
      handleDownload({
        namespace: "bookmarklet-bridge",
        version: 2,
        kind: "action",
        requestId: "req-2",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "...",
          content: "hello"
        }
      })
    ).rejects.toThrowError(
      new BridgeError("invalid_request", "payload.filename must resolve to a safe non-empty filename.")
    );
  });

  test("wraps browser download failures in a bridge error", async () => {
    createObjectUrlMock.mockReturnValue("blob:download-url");
    downloadMock.mockRejectedValue(new Error("browser failed"));

    await expect(
      handleDownload({
        namespace: "bookmarklet-bridge",
        version: 2,
        kind: "action",
        requestId: "req-3",
        executionId: "exec-1",
        action: "download",
        payload: {
          filename: "notes.txt",
          content: "hello"
        }
      })
    ).rejects.toThrowError(new BridgeError("download_failed", "The browser could not start the download."));
  });
});
