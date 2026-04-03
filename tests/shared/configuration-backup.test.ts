import { describe, expect, test } from "vitest";
import {
  buildConfigurationExport,
  decryptConfigurationExport,
  encryptConfigurationExport,
  parseEncryptedConfigurationExport
} from "../../src/shared/configuration-backup";
import type { BridgeState } from "../../src/shared/types";

const sampleState: BridgeState = {
  settings: {
    themeMode: "active",
    allowedOrigins: ["https://example.com"],
    toastDefaults: { durationMs: 2200 },
    requestDefaults: { timeoutMs: 10000 }
  },
  policies: [
    {
      definitionHash: "allow-1",
      sourceHash: "source-1",
      canonicalBookmarklet: "{}",
      name: "Allowed",
      version: 1,
      decision: "allow",
      inferredActions: ["getSettings"],
      decodedSource: "async run(bridge) { await bridge.getSettings(); }",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    },
    {
      definitionHash: "deny-1",
      sourceHash: "source-2",
      canonicalBookmarklet: "{}",
      name: "Denied",
      version: 1,
      decision: "deny",
      inferredActions: [],
      decodedSource: "async run(bridge) {}",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    }
  ],
  logs: [],
  bookmarkletSettingsSchemas: {
    "allow-1": {
      visibility: {
        type: "option",
        label: "Visibility",
        description: "Memo visibility.",
        default: "PRIVATE",
        options: ["PRIVATE", "PUBLIC"]
      }
    },
    "deny-1": {
      ignored: {
        type: "boolean",
        label: "Ignored",
        description: "Ignored.",
        default: false
      }
    }
  },
  bookmarkletSettingsValues: {
    "allow-1": {
      visibility: "PUBLIC"
    },
    "deny-1": {
      ignored: true
    }
  }
};

describe("configuration backup", () => {
  test("exports only approved policies and their settings", () => {
    const backup = buildConfigurationExport(sampleState);

    expect(backup.approvedPolicies).toHaveLength(1);
    expect(backup.approvedPolicies[0]?.definitionHash).toBe("allow-1");
    expect(Object.keys(backup.bookmarkletSettingsSchemas)).toEqual(["allow-1"]);
    expect(Object.keys(backup.bookmarkletSettingsValues)).toEqual(["allow-1"]);
  });

  test("encrypts to a readable metadata envelope and decrypts back", async () => {
    const backup = buildConfigurationExport(sampleState);
    const encrypted = await encryptConfigurationExport(backup, "secret-key");
    const parsed = parseEncryptedConfigurationExport(JSON.parse(JSON.stringify(encrypted)) as unknown);
    const decrypted = await decryptConfigurationExport(parsed, "secret-key");

    expect(encrypted.app).toBe("Bookmarklet Bridge");
    expect(encrypted.exportedAt).toBe(backup.exportedAt);
    expect(encrypted.scope).toBe("approved-policies-and-settings");
    expect(decrypted.approvedPolicies).toHaveLength(1);
    expect(decrypted.bookmarkletSettingsValues["allow-1"]).toEqual({ visibility: "PUBLIC" });
  });
});
