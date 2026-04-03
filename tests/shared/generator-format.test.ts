import { describe, expect, test } from "vitest";
import { compactJavaScript, formatGeneratorJavaScript, formatGeneratorSettingsText } from "../../src/shared/generator-format";

describe("formatGeneratorSettingsText", () => {
  test("pretty prints JSON", () => {
    expect(formatGeneratorSettingsText("{\"a\":1,\"b\":{\"c\":true}}")).toEqual({
      text: `{
  "a": 1,
  "b": {
    "c": true
  }
}`,
      error: null
    });
  });

  test("returns an error for invalid JSON", () => {
    const result = formatGeneratorSettingsText("{oops");
    expect(result.text).toBe("{oops");
    expect(result.error).toBeTruthy();
  });
});

describe("formatGeneratorJavaScript", () => {
  test("pretty prints compact bookmarklet run bodies", () => {
    expect(
      formatGeneratorJavaScript(
        `const result=await bridge.get("https://example.com",{headers:{Accept:"application/json"}});if(result){await bridge.toast("ok");}`
      )
    ).toBe(`const result=await bridge.get("https://example.com", {
  headers: {
    Accept: "application/json"
  }
});
if(result) {
  await bridge.toast("ok");
}`);
  });

  test("keeps semicolons inside for headers on one line", () => {
    expect(formatGeneratorJavaScript("for(let i=0;i<3;i+=1){console.log(i);}")).toBe(`for(let i=0; i<3; i+=1) {
  console.log(i);
}`);
  });

  test("pretty prints full bookmarklet wrappers for review", () => {
    const result = formatGeneratorJavaScript(
      `(() => {if (!window.BookmarkletBridge || typeof window.BookmarkletBridge.run !== "function") {alert("Bookmarklet Bridge is not available on this page.");return;}return window.BookmarkletBridge.run({name: "Example",version: 1,async run(bridge) {await bridge.toast("ok");}});})();`
    );

    expect(result).toContain("\n  if(");
    expect(result).toContain("return window.BookmarkletBridge.run({\n");
    expect(result).toContain('async run(bridge) {\n      await bridge.toast("ok");\n    }');
    expect(result).toContain("\n  });\n})();");
  });

  test("does not insert blank lines between already separated statements", () => {
    const result = formatGeneratorJavaScript(`const first = 1;
const second = 2;
await bridge.toast("ok");`);

    expect(result).not.toContain("\n\n");
    expect(result).toContain("const first=1;\nconst second=2;\nawait bridge.toast(\"ok\");");
  });
});

describe("compactJavaScript", () => {
  test("compacts wrapper whitespace without renaming identifiers", () => {
    const result = compactJavaScript(`(() => {
  let description = "Save to Memos";
  let settings = {};
  let run = async function run(bridge) {
    await bridge.toast("ok");
  };

  return window.BookmarkletBridge.run({
    name: "Example",
    version: 1,
    extendedDescription: description,
    settings: settings,
    run: run
  });
})();`);

    expect(result).toContain('let description="Save to Memos";');
    expect(result).toContain("let settings={};");
    expect(result).toContain('let run=async function run(bridge){await bridge.toast("ok");};');
    expect(result).toContain("extendedDescription:description");
    expect(result).not.toContain("\n");
  });
});
