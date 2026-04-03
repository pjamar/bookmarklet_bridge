import { BridgeError } from "../../shared/errors";
import type { DownloadActionMessage } from "../../shared/types";

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const flattened = trimmed.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-");
  const collapsed = flattened.replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").trim();
  if (!collapsed) {
    throw new BridgeError("invalid_request", "payload.filename must resolve to a safe non-empty filename.");
  }
  return collapsed;
}

function normalizeMimeType(mimeType: string | undefined): string {
  if (!mimeType) {
    return "text/plain;charset=utf-8";
  }
  return mimeType.includes("charset=") ? mimeType : `${mimeType};charset=utf-8`;
}

export async function handleDownload(request: DownloadActionMessage): Promise<{
  downloadId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const filename = sanitizeFilename(request.payload.filename);
  const mimeType = normalizeMimeType(request.payload.mimeType);
  const blob = new Blob([request.payload.content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const downloadId = await browser.downloads.download({
      url: objectUrl,
      filename,
      conflictAction: "uniquify"
    });

    return {
      downloadId,
      filename,
      mimeType,
      sizeBytes: new TextEncoder().encode(request.payload.content).length
    };
  } catch {
    throw new BridgeError("download_failed", "The browser could not start the download.");
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  }
}
