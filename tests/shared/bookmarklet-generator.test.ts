import { describe, expect, test } from "vitest";
import { buildGeneratorOutput } from "../../src/shared/bookmarklet-generator";
import { compactJavaScript } from "../../src/shared/generator-format";

describe("buildGeneratorOutput", () => {
  const baseDraft = {
    name: "Example",
    version: 1,
    extendedDescription: "Short description",
    settingsText: "{}",
    runBody: `await bridge.toast("ok");`
  };

  test("builds bridge-global output with an availability guard", () => {
    const result = buildGeneratorOutput(baseDraft);

    expect(result.fullSource).toContain("window.BookmarkletBridge.run");
    expect(result.fullSource).toContain('alert("Bookmarklet Bridge is not available on this page.")');
    expect(result.fullSource).toContain('let description = "Short description";');
    expect(result.fullSource).toContain("let settings = {};");
    expect(result.fullSource).toContain("let run = async function run(bridge) {");
    expect(result.fullSource).toContain("extendedDescription: description");
    expect(result.fullSource).toContain("settings: settings");
    expect(result.fullSource).toContain("run: run");
    expect(result.fullSource).not.toContain("const BRIDGE_NAMESPACE");
    expect(result.bookmarkletUrl).toBe(`javascript:${compactJavaScript(result.fullSource)}`);
    expect(result.bookmarkletUrl).not.toContain("%20");
    expect(result.bookmarkletUrl.length).toBeLessThan(`javascript:${encodeURIComponent(compactJavaScript(result.fullSource))}`.length);
  });

  test("includes validated settings schema in generated output", () => {
    const result = buildGeneratorOutput({
      ...baseDraft,
      settingsText: JSON.stringify(
        {
          visibility: {
            type: "option",
            label: "Visibility",
            description: "Memo visibility.",
            default: "PRIVATE",
            options: ["PRIVATE", "PUBLIC"]
          }
        },
        null,
        2
      )
    });

    expect(result.error).toBeNull();
    expect(result.fullSource).toContain('"Visibility"');
    expect(result.fullSource).toContain('"PUBLIC"');
  });

  test("surfaces invalid settings schema errors", () => {
    const result = buildGeneratorOutput({
      ...baseDraft,
      settingsText: `{"bad": true}`
    });

    expect(result.error).toContain("bookmarklet.settings.bad");
  });
});
