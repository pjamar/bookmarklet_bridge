import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);

export const HIGHLIGHT_THEME = `
  .hljs {
    display: block;
    overflow-x: auto;
    color: var(--code-ink, #1f1d17);
    background: transparent;
  }
  .hljs-comment,
  .hljs-quote {
    color: var(--code-comment, #7e7567);
    font-style: italic;
  }
  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-subst {
    color: var(--code-keyword, #8b2e1e);
    font-weight: 700;
  }
  .hljs-number,
  .hljs-literal,
  .hljs-variable,
  .hljs-variable.language_,
  .hljs-template-variable,
  .hljs-tag .hljs-attr {
    color: var(--code-number, #7a4b00);
  }
  .hljs-string,
  .hljs-doctag {
    color: var(--code-string, #116149);
  }
  .hljs-title,
  .hljs-title.function_,
  .hljs-function,
  .hljs-section,
  .hljs-selector-id {
    color: var(--code-function, #184e8a);
    font-weight: 700;
  }
  .hljs-property,
  .hljs-attr,
  .hljs-attribute,
  .hljs-name,
  .hljs-type {
    color: var(--code-property, #5f3dc4);
  }
  .hljs-punctuation,
  .hljs-operator {
    color: var(--code-punctuation, #6a6258);
  }
  .hljs-built_in,
  .hljs-bullet,
  .hljs-code,
  .hljs-addition {
    color: var(--code-built-in, #155e3a);
  }
  .hljs-deletion {
    color: var(--code-deletion, #922b21);
  }
  .hljs-meta {
    color: var(--code-meta, #5f4b32);
  }
`;

export function highlightIntoElement(
  element: HTMLElement,
  language: "javascript" | "json" = "javascript"
): void {
  const text = element.textContent ?? "";
  const result = hljs.highlight(text, { language });
  element.innerHTML = result.value;
  element.dataset.language = language;
  element.classList.add("hljs");
}
