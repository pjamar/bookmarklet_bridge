import { BridgeError } from "../../shared/errors";
import type { BridgeSettings, DownloadActionMessage, DownloadUrlActionMessage } from "../../shared/types";
import { validateOrigin } from "./network";

export function sanitizeFilename(filename: string): string {
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

function decodeBase64(bytesBase64: string): Uint8Array {
  try {
    const decoded = atob(bytesBase64);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new BridgeError("invalid_request", "payload.bytesBase64 must be valid base64.");
  }
}

export async function handleDownload(request: DownloadActionMessage): Promise<{
  downloadId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const filename = sanitizeFilename(request.payload.filename);
  const isBinary = request.payload.bytesBase64 !== undefined;
  const mimeType = request.payload.mimeType
    ? normalizeMimeType(request.payload.mimeType)
    : isBinary
      ? "application/octet-stream"
      : "text/plain;charset=utf-8";
  const data =
    request.payload.bytesBase64 !== undefined
      ? decodeBase64(request.payload.bytesBase64)
      : request.payload.content ?? "";
  const blob = new Blob([data], { type: mimeType });
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
      sizeBytes: blob.size
    };
  } catch {
    throw new BridgeError("download_failed", "The browser could not start the download.");
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60_000);
  }
}

export async function handleDownloadUrl(
  request: DownloadUrlActionMessage,
  settings: BridgeSettings
): Promise<{ downloadId: number; url: string; filename?: string }> {
  let url: URL;
  try {
    url = new URL(request.payload.url);
  } catch {
    throw new BridgeError("invalid_request", "payload.url must be a valid full URL.");
  }

  validateOrigin(url, settings.allowedOrigins);
  const filename = request.payload.filename ? sanitizeFilename(request.payload.filename) : undefined;

  try {
    const downloadId = await browser.downloads.download({
      url: url.toString(),
      filename,
      conflictAction: "uniquify"
    });
    return {
      downloadId,
      url: url.toString(),
      filename
    };
  } catch {
    throw new BridgeError("download_failed", "The browser could not start the download.");
  }
}
