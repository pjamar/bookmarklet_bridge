import { parseBookmarkletSettingsSchema } from "./bookmarklet-settings";
import { compactJavaScript } from "./generator-format";

export interface GeneratorDraftShape {
  name: string;
  version: number;
  extendedDescription: string;
  settingsText: string;
  runBody: string;
}

export interface GeneratorBuildResult {
  runSource: string;
  fullSource: string;
  bookmarkletUrl: string;
  error: string | null;
}

export function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  const normalized = String(value ?? "");
  return normalized
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}

export function buildRunSource(runBody: string): string {
  return `async run(bridge) {\n${indentBlock(runBody, 2)}\n}`;
}

function buildRunVariableSource(runBody: string): string {
  return `let run = async function run(bridge) {\n${indentBlock(runBody, 2)}\n};`;
}

function buildSettingsSource(settingsText: string): { source: string; error: string | null } {
  const trimmed = settingsText.trim();
  if (!trimmed) {
    return { source: "{}", error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const schema = parseBookmarkletSettingsSchema(parsed);
    return {
      source: JSON.stringify(schema ?? {}, null, 2),
      error: null
    };
  } catch (error) {
    return {
      source: "{}",
      error: error instanceof Error ? error.message : "Invalid settings JSON."
    };
  }
}

function buildBookmarkletUrl(source: string): string {
  const minimallyEscaped = source.replace(/[%#\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (char) =>
    encodeURIComponent(char)
  );
  return `javascript:${minimallyEscaped}`;
}

export function buildGeneratorOutput(draft: GeneratorDraftShape): GeneratorBuildResult {
  const runSource = buildRunSource(draft.runBody);
  const settingsResult = buildSettingsSource(draft.settingsText);
  const runVariableSource = buildRunVariableSource(draft.runBody);
  const fullSource = `(() => {\n  if (!window.BookmarkletBridge || typeof window.BookmarkletBridge.run !== "function") {\n    alert("Bookmarklet Bridge is not available on this page.");\n    return;\n  }\n\n  let description = ${JSON.stringify(draft.extendedDescription)};\n  let settings = ${indentBlock(settingsResult.source, 2).trimStart()};\n  ${runVariableSource.replaceAll("\n", "\n  ")}\n\n  return window.BookmarkletBridge.run({\n    name: ${JSON.stringify(draft.name)},\n    version: ${draft.version},\n    extendedDescription: description,\n    settings: settings,\n    run: run\n  });\n})();`;
  const compactSource = compactJavaScript(fullSource);

  return {
    runSource,
    fullSource,
    bookmarkletUrl: buildBookmarkletUrl(compactSource),
    error: settingsResult.error
  };
}
