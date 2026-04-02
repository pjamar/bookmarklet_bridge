import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOAST_DURATION_MS,
  MAX_TIMEOUT_MS,
  MAX_TOAST_DURATION_MS,
  MIN_TIMEOUT_MS,
  MIN_TOAST_DURATION_MS,
  SETTINGS_STORAGE_KEY
} from "../../shared/constants";
import { BridgeError } from "../../shared/errors";
import type { BridgeSettings } from "../../shared/types";

const DEFAULT_SETTINGS: BridgeSettings = {
  allowedOrigins: [],
  toastDefaults: {
    durationMs: DEFAULT_TOAST_DURATION_MS
  },
  requestDefaults: {
    timeoutMs: DEFAULT_TIMEOUT_MS
  }
};

function normalizeOrigins(origins: string[]): string[] {
  return Array.from(
    new Set(
      origins.map((origin) => {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new BridgeError("invalid_request", `Invalid allowed origin: ${origin}.`);
        }
        if (parsed.origin !== origin) {
          throw new BridgeError("invalid_request", `Allowed origin must be an exact origin: ${origin}.`);
        }
        return origin;
      })
    )
  ).sort();
}

export async function getSettings(): Promise<BridgeSettings> {
  const result = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  const stored = result[SETTINGS_STORAGE_KEY] as Partial<BridgeSettings> | undefined;
  return {
    allowedOrigins: normalizeOrigins(stored?.allowedOrigins ?? DEFAULT_SETTINGS.allowedOrigins),
    toastDefaults: {
      durationMs: clamp(stored?.toastDefaults?.durationMs, MIN_TOAST_DURATION_MS, MAX_TOAST_DURATION_MS, DEFAULT_TOAST_DURATION_MS)
    },
    requestDefaults: {
      timeoutMs: clamp(stored?.requestDefaults?.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    }
  };
}

export async function saveSettings(settings: BridgeSettings): Promise<BridgeSettings> {
  const normalized: BridgeSettings = {
    allowedOrigins: normalizeOrigins(settings.allowedOrigins),
    toastDefaults: {
      durationMs: clamp(settings.toastDefaults.durationMs, MIN_TOAST_DURATION_MS, MAX_TOAST_DURATION_MS, DEFAULT_TOAST_DURATION_MS)
    },
    requestDefaults: {
      timeoutMs: clamp(settings.requestDefaults.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    }
  };
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
