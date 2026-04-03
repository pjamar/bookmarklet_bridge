import { describe, expect, test } from "vitest";
import {
  scanBookmarkTreeForBridgeBookmarklets,
  scanBridgeBookmarklet
} from "../../src/shared/bookmarklet-scan";

describe("scanBridgeBookmarklet", () => {
  test("detects bridge-global bookmarklets", () => {
    const source = `javascript:${encodeURIComponent(`(() => {
  return window.BookmarkletBridge.run({
    name: "Save To Memos",
    version: 2,
    extendedDescription: "Stores the current page in Memos.",
    async run(bridge) {}
  });
})()`)}`
;

    expect(scanBridgeBookmarklet("Memo Bookmarklet", source, "Toolbar / Memo Bookmarklet")).toEqual({
      bookmarkTitle: "Memo Bookmarklet",
      name: "Save To Memos",
      version: 2,
      description: "Stores the current page in Memos.",
      location: "Toolbar / Memo Bookmarklet",
      settingsText: "{}",
      runBody: ""
    });
  });

  test("extracts generator-editable settings and run body", () => {
    const source = `javascript:${encodeURIComponent(`(() => {
  return window.BookmarkletBridge.run({
    name: "Save To Memos",
    version: 2,
    extendedDescription: "Stores the current page in Memos.",
    settings: {
      "visibility": {
        "type": "option",
        "label": "Visibility",
        "description": "Memo visibility.",
        "default": "PRIVATE",
        "options": ["PRIVATE", "PUBLIC"]
      }
    },
    async run(bridge) {
      await bridge.toast("Running...");
      console.log(location.href);
    }
  });
})()`)}`
;

    expect(scanBridgeBookmarklet("Memo Bookmarklet", source, "Toolbar / Memo Bookmarklet")).toEqual({
      bookmarkTitle: "Memo Bookmarklet",
      name: "Save To Memos",
      version: 2,
      description: "Stores the current page in Memos.",
      location: "Toolbar / Memo Bookmarklet",
      settingsText: `{
  "visibility": {
    "type": "option",
    "label": "Visibility",
    "description": "Memo visibility.",
    "default": "PRIVATE",
    "options": [
      "PRIVATE",
      "PUBLIC"
    ]
  }
}`,
      runBody: `await bridge.toast("Running...");
console.log(location.href);`
    });
  });

  test("extracts description and settings from generator variables", () => {
    const source = `javascript:${encodeURIComponent(`(() => {
  if (!window.BookmarkletBridge || typeof window.BookmarkletBridge.run !== "function") {
    alert("Bookmarklet Bridge is not available on this page.");
    return;
  }

  let description = "Save to Memos";
  let settings = {
    "baseUrl": {
      "type": "text",
      "label": "Base URL",
      "description": "Memo service base URL.",
      "default": "https://a.domain.com"
    }
  };
  let run = async function run(bridge) {
    const settings = await bridge.getSettings();
    console.log(settings.baseUrl);
  };

  return window.BookmarkletBridge.run({
    name: "Memos+2",
    version: 2,
    extendedDescription: description,
    settings: settings,
    run: run
  });
})()`)}`
;

    expect(scanBridgeBookmarklet("Memo Bookmarklet", source, "Toolbar / Memo Bookmarklet")).toEqual({
      bookmarkTitle: "Memo Bookmarklet",
      name: "Memos+2",
      version: 2,
      description: "Save to Memos",
      location: "Toolbar / Memo Bookmarklet",
      settingsText: `{
  "baseUrl": {
    "type": "text",
    "label": "Base URL",
    "description": "Memo service base URL.",
    "default": "https://a.domain.com"
  }
}`,
      runBody: `const settings = await bridge.getSettings();
console.log(settings.baseUrl);`
    });
  });

  test("ignores unrelated javascript bookmarks", () => {
    expect(scanBridgeBookmarklet("Other", "javascript:alert('x')", "Toolbar / Other")).toBeNull();
  });
});

describe("scanBookmarkTreeForBridgeBookmarklets", () => {
  test("walks nested bookmark trees", () => {
    const results = scanBookmarkTreeForBridgeBookmarklets([
      {
        title: "Bookmarks Toolbar",
        children: [
          {
            title: "Folder",
            children: [
              {
                title: "Bridge Bookmarklet",
                url: `javascript:${encodeURIComponent(`window.BookmarkletBridge.run({ name: "Nested", version: 3, async run(bridge) {} });`)}`
              }
            ]
          }
        ]
      }
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Nested");
    expect(results[0]?.location).toBe("Bookmarks Toolbar / Folder / Bridge Bookmarklet");
  });
});
