import { afterEach, describe, expect, test, vi } from "vitest";
import { BridgeError } from "../../../src/shared/errors";
import { handleDownload, handleDownloadUrl } from "../../../src/background/actions/download";

const downloadMock = vi.fn();
const createObjectUrlMock = vi.fn();
const revokeObjectUrlMock = vi.fn();
const NativeURL = URL;

vi.stubGlobal("browser", {
  downloads: {
    download: downloadMock
  }
});

class TestURL extends NativeURL {
  static createObjectURL = createObjectUrlMock;
  static revokeObjectURL = revokeObjectUrlMock;
}

vi.stubGlobal("URL", TestURL);

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

  test("accepts base64 bytes for binary downloads", async () => {
    createObjectUrlMock.mockReturnValue("blob:download-url");
    downloadMock.mockResolvedValue(21);

    const result = await handleDownload({
      namespace: "bookmarklet-bridge",
      version: 2,
      kind: "action",
      requestId: "req-4",
      executionId: "exec-1",
      action: "download",
      payload: {
        filename: "pixel.png",
        bytesBase64: "AQIDBA==",
        mimeType: "image/png"
      }
    });

    expect(result).toEqual({
      downloadId: 21,
      filename: "pixel.png",
      mimeType: "image/png;charset=utf-8",
      sizeBytes: 4
    });
  });
});

describe("handleDownloadUrl", () => {
  test("starts a browser-managed download from a URL", async () => {
    downloadMock.mockResolvedValue(31);

    const result = await handleDownloadUrl(
      {
        namespace: "bookmarklet-bridge",
        version: 2,
        kind: "action",
        requestId: "req-5",
        executionId: "exec-1",
        action: "downloadUrl",
        payload: {
          url: "https://example.com/files/report.pdf",
          filename: "report.pdf"
        }
      },
      {
        allowedOrigins: [],
        requestDefaults: { timeoutMs: 10000 },
        toastDefaults: { durationMs: 2200 }
      }
    );

    expect(downloadMock).toHaveBeenCalledWith({
      url: "https://example.com/files/report.pdf",
      filename: "report.pdf",
      conflictAction: "uniquify"
    });
    expect(result).toEqual({
      downloadId: 31,
      url: "https://example.com/files/report.pdf",
      filename: "report.pdf"
    });
  });

  test("applies allowed origin checks to download URLs", async () => {
    await expect(
      handleDownloadUrl(
        {
          namespace: "bookmarklet-bridge",
          version: 2,
          kind: "action",
          requestId: "req-6",
          executionId: "exec-1",
          action: "downloadUrl",
          payload: {
            url: "https://blocked.example.com/file.bin"
          }
        },
        {
          allowedOrigins: ["https://example.com"],
          requestDefaults: { timeoutMs: 10000 },
          toastDefaults: { durationMs: 2200 }
        }
      )
    ).rejects.toThrowError(
      new BridgeError("origin_not_allowed", "Origin https://blocked.example.com is not allowed by extension settings.")
    );
  });
});
