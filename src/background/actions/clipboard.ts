import { BridgeError } from "../../shared/errors";
import type { ClipboardActionMessage } from "../../shared/types";

export async function handleCopyText(
  request: ClipboardActionMessage
): Promise<{ copied: true; sizeBytes: number }> {
  try {
    await navigator.clipboard.writeText(request.payload.text);
    return {
      copied: true,
      sizeBytes: new TextEncoder().encode(request.payload.text).length
    };
  } catch {
    throw new BridgeError("clipboard_write_failed", "The browser could not write to the clipboard.");
  }
}
