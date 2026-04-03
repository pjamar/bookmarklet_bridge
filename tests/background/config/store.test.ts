import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getSettings, saveSettings } from "../../../src/background/config/store";
import { SETTINGS_STORAGE_KEY } from "../../../src/shared/constants";

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("browser", {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: storage.get(key) };
        },
        async set(value: Record<string, unknown>) {
          for (const [key, entry] of Object.entries(value)) {
            storage.set(key, entry);
          }
        }
      }
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("config store", () => {
  test("defaults theme mode to active", async () => {
    await expect(getSettings()).resolves.toMatchObject({
      themeMode: "active"
    });
  });

  test("persists normalized theme mode", async () => {
    const saved = await saveSettings({
      themeMode: "dark",
      allowedOrigins: ["https://example.com"],
      toastDefaults: { durationMs: 2200 },
      requestDefaults: { timeoutMs: 10000 }
    });

    expect(saved.themeMode).toBe("dark");
    expect(storage.get(SETTINGS_STORAGE_KEY)).toEqual(saved);
  });
});
