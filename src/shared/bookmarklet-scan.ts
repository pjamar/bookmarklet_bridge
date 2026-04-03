export interface BridgeBookmarkletScanResult {
  bookmarkTitle: string;
  name: string;
  version: number;
  description: string;
  location: string;
  settingsText: string;
  runBody: string;
}

interface BookmarkTreeNode {
  title?: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

function decodeBookmarkletUrl(url: string): string {
  if (!url.startsWith("javascript:")) {
    return url;
  }

  const source = url.slice("javascript:".length);
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function decodeQuotedLiteral(rawValue: string): string {
  const quote = rawValue[0];
  if ((quote !== '"' && quote !== "'") || rawValue[rawValue.length - 1] !== quote) {
    return rawValue;
  }

  if (quote === '"') {
    try {
      return JSON.parse(rawValue) as string;
    } catch {
      return rawValue.slice(1, -1);
    }
  }

  const inner = rawValue
    .slice(1, -1)
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'");
  return inner;
}

function readStringProperty(source: string, propertyName: string): string | null {
  const pattern = new RegExp(
    `\\b${propertyName}\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`,
    "s"
  );
  const match = source.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  return decodeQuotedLiteral(match[1]);
}

function readIdentifierProperty(source: string, propertyName: string): string | null {
  const pattern = new RegExp(`\\b${propertyName}\\s*:\\s*([A-Za-z_$][\\w$]*)`, "s");
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function readVersion(source: string): number | null {
  const match = source.match(/\bversion\s*:\s*(\d+)/);
  if (!match?.[1]) {
    return null;
  }
  return Number(match[1]);
}

function readStringVariable(source: string, variableName: string): string | null {
  const pattern = new RegExp(
    `\\b(?:const|let|var)\\s+${variableName}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`,
    "s"
  );
  const match = source.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  return decodeQuotedLiteral(match[1]);
}

function findMatchingDelimiter(source: string, startIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (current === "\\") {
        escaping = true;
        continue;
      }
      if (current === inString) {
        inString = null;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      inString = current;
      continue;
    }

    if (current === openChar) {
      depth += 1;
      continue;
    }

    if (current === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function readGeneratorSettingsText(source: string): string {
  const directSettingsMatch = source.match(/\bsettings\s*:\s*\{/);
  const variableName = readIdentifierProperty(source, "settings");
  let rawValue = "{}";

  if (directSettingsMatch?.index !== undefined) {
    const objectStart = source.indexOf("{", directSettingsMatch.index);
    if (objectStart !== -1) {
      const objectEnd = findMatchingDelimiter(source, objectStart, "{", "}");
      if (objectEnd !== -1) {
        rawValue = source.slice(objectStart, objectEnd + 1);
      }
    }
  } else if (variableName) {
    const variableMatch = source.match(new RegExp(`\\b(?:const|let|var)\\s+${variableName}\\s*=\\s*\\{`, "s"));
    if (variableMatch?.index !== undefined) {
      const objectStart = source.indexOf("{", variableMatch.index);
      if (objectStart !== -1) {
        const objectEnd = findMatchingDelimiter(source, objectStart, "{", "}");
        if (objectEnd !== -1) {
          rawValue = source.slice(objectStart, objectEnd + 1);
        }
      }
    }
  }

  try {
    return JSON.stringify(JSON.parse(rawValue) as unknown, null, 2);
  } catch {
    return rawValue.trim();
  }
}

function stripCommonIndentation(value: string): string {
  const lines = value.replace(/^\n+|\n+$/g, "").split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const indent = nonEmptyLines.reduce<number>((smallest, line) => {
    const match = line.match(/^ */);
    const count = match ? match[0].length : 0;
    return Math.min(smallest, count);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(indent)) {
    return "";
  }

  return lines
    .map((line) => line.slice(Math.min(indent, line.length)))
    .join("\n")
    .replace(/\s+$/g, "");
}

function readGeneratorRunBody(source: string): string {
  const directRunMatch = source.match(/\basync\s+run\s*\(\s*bridge\s*\)\s*\{/);
  let startIndex = directRunMatch?.index;

  if (startIndex === undefined) {
    const runVariableName = readIdentifierProperty(source, "run");
    if (runVariableName) {
      const runVariableMatch = source.match(
        new RegExp(
          `\\b(?:const|let|var)\\s+${runVariableName}\\s*=\\s*async\\s+function(?:\\s+[A-Za-z_$][\\w$]*)?\\s*\\(\\s*bridge\\s*\\)\\s*\\{`,
          "s"
        )
      );
      startIndex = runVariableMatch?.index;
    }
  }

  if (startIndex === undefined) {
    return "";
  }

  const bodyStart = source.indexOf("{", startIndex);
  if (bodyStart === -1) {
    return "";
  }

  const bodyEnd = findMatchingDelimiter(source, bodyStart, "{", "}");
  if (bodyEnd === -1) {
    return "";
  }

  return stripCommonIndentation(source.slice(bodyStart + 1, bodyEnd));
}

export function scanBridgeBookmarklet(
  bookmarkTitle: string,
  bookmarkUrl: string,
  location: string
): BridgeBookmarkletScanResult | null {
  if (!bookmarkUrl.startsWith("javascript:")) {
    return null;
  }

  const source = decodeBookmarkletUrl(bookmarkUrl);
  if (!source.includes("window.BookmarkletBridge.run(")) {
    return null;
  }

  const name = readStringProperty(source, "name");
  const version = readVersion(source);
  if (!name || version === null) {
    return null;
  }

  return {
    bookmarkTitle,
    name,
    version,
    description:
      readStringProperty(source, "extendedDescription") ??
      (() => {
        const descriptionVariable = readIdentifierProperty(source, "extendedDescription");
        return descriptionVariable ? readStringVariable(source, descriptionVariable) ?? "" : "";
      })(),
    location,
    settingsText: readGeneratorSettingsText(source),
    runBody: readGeneratorRunBody(source)
  };
}

export function scanBookmarkTreeForBridgeBookmarklets(
  nodes: BookmarkTreeNode[],
  pathPrefix = ""
): BridgeBookmarkletScanResult[] {
  const results: BridgeBookmarkletScanResult[] = [];

  for (const node of nodes) {
    const title = node.title?.trim() || "Untitled";
    const location = pathPrefix ? `${pathPrefix} / ${title}` : title;

    if (node.url) {
      const result = scanBridgeBookmarklet(title, node.url, location);
      if (result) {
        results.push(result);
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      results.push(...scanBookmarkTreeForBridgeBookmarklets(node.children, location));
    }
  }

  return results.sort((left, right) => left.name.localeCompare(right.name) || left.version - right.version);
}
