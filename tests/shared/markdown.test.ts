import { describe, expect, test } from "vitest";
import { renderMarkdown } from "../../src/shared/markdown";

describe("renderMarkdown", () => {
  test("renders headings, emphasis, code, and lists", () => {
    expect(
      renderMarkdown(`# Title

Paragraph with **bold**, *italic*, and \`code\`.

- first
- second`)
    ).toContain("<h1>Title</h1>");

    expect(
      renderMarkdown(`# Title

Paragraph with **bold**, *italic*, and \`code\`.

- first
- second`)
    ).toContain("<p>Paragraph with <strong>bold</strong>, <em>italic</em>, and <code>code</code>.</p>");

    expect(
      renderMarkdown(`# Title

Paragraph with **bold**, *italic*, and \`code\`.

- first
- second`)
    ).toContain("<ul><li>first</li><li>second</li></ul>");
  });

  test("escapes html while preserving markdown links", () => {
    const rendered = renderMarkdown(`Danger <script>alert(1)</script>

[Docs](https://example.com/docs)`);

    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>');
  });
});
