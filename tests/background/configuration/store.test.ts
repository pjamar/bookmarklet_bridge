import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { importConfigurationBackup } from "../../../src/background/configuration/store";
import {
  BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY,
  BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY,
  POLICIES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY
} from "../../../src/shared/constants";
import type { BridgeConfigurationExport, PolicyEntry } from "../../../src/shared/types";

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

describe("importConfigurationBackup", () => {
  test("replaces approved policies and keeps denied ones", async () => {
    const deniedPolicy: PolicyEntry = {
      definitionHash: "deny-1",
      sourceHash: "source-deny",
      canonicalBookmarklet: "{}",
      name: "Denied",
      version: 1,
      decision: "deny",
      inferredActions: [],
      decodedSource: "async run(bridge) {}",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    };

    storage.set(POLICIES_STORAGE_KEY, {
      "allow-old": {
        ...deniedPolicy,
        definitionHash: "allow-old",
        name: "Old Allowed",
        decision: "allow"
      },
      "deny-1": deniedPolicy
    });

    const payload: BridgeConfigurationExport = {
      format: "bookmarklet-bridge-config",
      version: 1,
      exportedAt: "2026-04-03T00:00:00.000Z",
      settings: {
        themeMode: "dark",
        allowedOrigins: ["https://example.com"],
        toastDefaults: { durationMs: 2400 },
        requestDefaults: { timeoutMs: 9000 }
      },
      approvedPolicies: [
        {
          ...deniedPolicy,
          definitionHash: "allow-new",
          name: "New Allowed",
          decision: "allow"
        }
      ],
      bookmarkletSettingsSchemas: {
        "allow-new": {
          includeSelection: {
            type: "boolean",
            label: "Include selection",
            description: "Append selection.",
            default: true
          }
        }
      },
      bookmarkletSettingsValues: {
        "allow-new": {
          includeSelection: false
        }
      }
    };

    await importConfigurationBackup(payload);

    expect(storage.get(SETTINGS_STORAGE_KEY)).toEqual(payload.settings);
    expect(storage.get(POLICIES_STORAGE_KEY)).toEqual({
      "deny-1": deniedPolicy,
      "allow-new": payload.approvedPolicies[0]
    });
    expect(storage.get(BOOKMARKLET_SETTINGS_SCHEMA_STORAGE_KEY)).toEqual(payload.bookmarkletSettingsSchemas);
    expect(storage.get(BOOKMARKLET_SETTINGS_VALUES_STORAGE_KEY)).toEqual(payload.bookmarkletSettingsValues);
  });
});
