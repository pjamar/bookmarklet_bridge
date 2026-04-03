import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  getBookmarkletSettingsValues,
  listBookmarkletSettingsSchemas,
  saveBookmarkletSettingsSchema,
  saveBookmarkletSettingsValues
} from "../../../src/background/bookmarklet-settings/store";
import type { BookmarkletSettingsSchema } from "../../../src/shared/types";

const schema: BookmarkletSettingsSchema = {
  includeSelection: {
    type: "boolean",
    label: "Include selection",
    description: "Append selected text to the payload.",
    default: true
  },
  timeoutSeconds: {
    type: "integer",
    label: "Timeout",
    description: "Maximum wait time.",
    default: 10,
    min: 1,
    max: 60
  }
};

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

describe("bookmarklet settings store", () => {
  test("persists schemas by definition hash", async () => {
    await saveBookmarkletSettingsSchema("hash-1", schema);

    expect(await listBookmarkletSettingsSchemas()).toEqual({
      "hash-1": schema
    });
    expect(await getBookmarkletSettingsValues("hash-1")).toEqual({
      includeSelection: true,
      timeoutSeconds: 10
    });
  });

  test("normalizes stored values against the schema", async () => {
    await saveBookmarkletSettingsSchema("hash-1", schema);

    expect(
      await saveBookmarkletSettingsValues("hash-1", {
        includeSelection: false,
        timeoutSeconds: 100
      })
    ).toEqual({
      includeSelection: false,
      timeoutSeconds: 10
    });
  });
});
