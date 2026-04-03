export interface FormatTextResult {
  text: string;
  error: string | null;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function formatGeneratorSettingsText(settingsText: string): FormatTextResult {
  const trimmed = normalizeLineBreaks(settingsText).trim();
  if (!trimmed) {
    return { text: "", error: null };
  }

  try {
    return {
      text: JSON.stringify(JSON.parse(trimmed) as unknown, null, 2),
      error: null
    };
  } catch (error) {
    return {
      text: settingsText,
      error: error instanceof Error ? error.message : "Invalid JSON."
    };
  }
}

function repeatIndent(level: number): string {
  return "  ".repeat(Math.max(0, level));
}

function trimTrailingWhitespace(value: string): string {
  return value.replace(/[ \t]+$/g, "");
}

function isWordChar(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function shouldAddSpace(previous: string, next: string): boolean {
  if (!previous || !next || previous === "\n" || next === "\n") {
    return false;
  }
  if (previous === "(" || previous === "[" || previous === "{" || previous === "." || previous === "!" || previous === "~") {
    return false;
  }
  if (next === ")" || next === "]" || next === "}" || next === "." || next === "," || next === ";" || next === ":") {
    return false;
  }
  if ((previous === "+" || previous === "-") && previous === next) {
    return false;
  }
  if (isWordChar(previous) && isWordChar(next)) {
    return true;
  }
  if ((previous === ")" || previous === "]") && isWordChar(next)) {
    return true;
  }
  if ((previous === ")" || previous === "]" || previous === "}") && (next === "(" || next === "{" || isWordChar(next))) {
    return true;
  }
  return false;
}

export function compactJavaScript(sourceText: string): string {
  const source = normalizeLineBreaks(sourceText).trim();
  if (!source) {
    return "";
  }

  let result = "";
  let index = 0;
  let previousTokenEnd = "";
  const shouldAddCompactSpace = (previous: string, next: string): boolean => {
    if (!previous || !next) {
      return false;
    }
    if (isWordChar(previous) && isWordChar(next)) {
      return true;
    }
    if ((previous === ")" || previous === "]") && isWordChar(next)) {
      return true;
    }
    return false;
  };

  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (/\s/.test(current)) {
      let cursor = index;
      while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      const nextToken = source[cursor] ?? "";
      if (shouldAddCompactSpace(previousTokenEnd, nextToken)) {
        result += " ";
        previousTokenEnd = " ";
      }
      index = cursor;
      continue;
    }

    if (current === "/" && next === "/") {
      const start = index;
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      const token = source.slice(start, index);
      if (shouldAddCompactSpace(previousTokenEnd, token[0] ?? "")) {
        result += " ";
      }
      result += token;
      previousTokenEnd = token[token.length - 1] ?? previousTokenEnd;
      continue;
    }

    if (current === "/" && next === "*") {
      const start = index;
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index = Math.min(source.length, index + 2);
      const token = source.slice(start, index);
      if (shouldAddCompactSpace(previousTokenEnd, token[0] ?? "")) {
        result += " ";
      }
      result += token;
      previousTokenEnd = token[token.length - 1] ?? previousTokenEnd;
      continue;
    }

    if (current === "'" || current === "\"" || current === "`") {
      const quote = current;
      const start = index;
      index += 1;
      let escaping = false;
      while (index < source.length) {
        const char = source[index] ?? "";
        if (escaping) {
          escaping = false;
          index += 1;
          continue;
        }
        if (char === "\\") {
          escaping = true;
          index += 1;
          continue;
        }
        if (char === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      const token = source.slice(start, index);
      if (shouldAddCompactSpace(previousTokenEnd, token[0] ?? "")) {
        result += " ";
      }
      result += token;
      previousTokenEnd = token[token.length - 1] ?? previousTokenEnd;
      continue;
    }

    const start = index;
    index += 1;
    while (index < source.length && !/[\s()[\]{};:,.?'"`/]/.test(source[index] ?? "")) {
      index += 1;
    }
    const token = source.slice(start, index);
    if (shouldAddCompactSpace(previousTokenEnd, token[0] ?? "")) {
      result += " ";
    }
    result += token;
    previousTokenEnd = token[token.length - 1] ?? previousTokenEnd;
  }

  return result.trim();
}

export function formatGeneratorJavaScript(sourceText: string): string {
  const source = normalizeLineBreaks(sourceText).trim();
  if (!source) {
    return "";
  }

  let result = "";
  let indentLevel = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let index = 0;
  let atLineStart = true;
  let previousTokenEnd = "";

  const push = (value: string) => {
    if (!value) {
      return;
    }
    if (atLineStart) {
      result += repeatIndent(indentLevel);
      atLineStart = false;
    }
    result += value;
    previousTokenEnd = value[value.length - 1] ?? previousTokenEnd;
  };

  const newline = (count = 1) => {
    result = trimTrailingWhitespace(result);
    result += "\n".repeat(Math.max(1, count));
    result = result.replace(/\n{3,}/g, "\n\n");
    atLineStart = true;
    previousTokenEnd = "\n";
  };

  const peekNonWhitespace = (from: number): string => {
    for (let cursor = from; cursor < source.length; cursor += 1) {
      const value = source[cursor];
      if (value && !/\s/.test(value)) {
        return value;
      }
    }
    return "";
  };

  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (/\s/.test(current)) {
      if (current === "\n") {
        newline();
      }
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      const start = index;
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      if (!atLineStart && !result.endsWith(" ")) {
        result += " ";
      }
      push(source.slice(start, index));
      newline();
      continue;
    }

    if (current === "/" && next === "*") {
      const start = index;
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index = Math.min(source.length, index + 2);
      if (!atLineStart && !result.endsWith(" ")) {
        result += " ";
      }
      push(source.slice(start, index));
      newline();
      continue;
    }

    if (current === "'" || current === "\"" || current === "`") {
      const quote = current;
      const start = index;
      index += 1;
      let escaping = false;
      while (index < source.length) {
        const char = source[index] ?? "";
        if (escaping) {
          escaping = false;
          index += 1;
          continue;
        }
        if (char === "\\") {
          escaping = true;
          index += 1;
          continue;
        }
        if (char === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      const token = source.slice(start, index);
      if (shouldAddSpace(previousTokenEnd, token[0] ?? "")) {
        result += " ";
      }
      push(token);
      continue;
    }

    if (current === "{") {
      if (shouldAddSpace(previousTokenEnd, current)) {
        result += " ";
      }
      push("{");
      indentLevel += 1;
      newline();
      index += 1;
      continue;
    }

    if (current === "}") {
      indentLevel = Math.max(0, indentLevel - 1);
      if (!atLineStart) {
        newline();
      }
      push("}");
      const nextChar = peekNonWhitespace(index + 1);
      if (nextChar && nextChar !== ";" && nextChar !== "," && nextChar !== ")" && nextChar !== "]") {
        newline();
      }
      index += 1;
      continue;
    }

    if (current === "(") {
      parenDepth += 1;
      push("(");
      index += 1;
      continue;
    }

    if (current === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      push(")");
      index += 1;
      continue;
    }

    if (current === "[") {
      bracketDepth += 1;
      push("[");
      index += 1;
      continue;
    }

    if (current === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      push("]");
      index += 1;
      continue;
    }

    if (current === ";") {
      push(";");
      if (parenDepth === 0) {
        newline();
      } else {
        result += " ";
        previousTokenEnd = " ";
      }
      index += 1;
      continue;
    }

    if (current === ",") {
      push(",");
      if (parenDepth === 0 && (bracketDepth > 0 || indentLevel > 0)) {
        newline();
      } else {
        result += " ";
        previousTokenEnd = " ";
      }
      index += 1;
      continue;
    }

    if (current === ":") {
      push(":");
      result += " ";
      previousTokenEnd = " ";
      index += 1;
      continue;
    }

    if (current === "." || current === "?") {
      push(current);
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    while (index < source.length && !/[\s()[\]{};:,.?'"`/]/.test(source[index] ?? "")) {
      index += 1;
    }
    const token = source.slice(start, index);
    if (shouldAddSpace(previousTokenEnd, token[0] ?? "")) {
      result += " ";
    }
    push(token);
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}
