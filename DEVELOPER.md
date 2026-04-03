# Bookmarklet Bridge Developer Guide

This guide is for two kinds of readers:

- someone writing bookmarklets that use the bridge
- someone tweaking the extension itself

The project is still experimental. It was vibe-coded, then gradually reviewed and cleaned up while its author learned how WebExtensions fit together. Read this guide as practical working documentation, not as a claim that every API surface is final.

## The Main Idea

Bookmarklet authors should not need to manually construct transport messages.

The intended authoring model is:

```js
runBookmarklet({
  name: "Example",
  version: 1,
  async run(bridge) {
    await bridge.get("https://example.com/api/me");
    await bridge.post("https://example.com/api/items", { hello: "world" });
    await bridge.toast("Done");
    await bridge.download({ filename: "example.txt", content: "Saved" });
    await bridge.copyText("Copied");
  }
});
```

The bookmarklet owns page logic.
The extension owns approval, privileged work, and logging.

## Public Bookmarklet API

### `runBookmarklet({ name, version, run })`

This is the entry point.

Required fields:

- `name`: stable human-readable identifier
- `version`: integer version for the bookmarklet definition
- `run`: async function that receives the `bridge`

What it does conceptually:

1. derives readable source
2. registers the bookmarklet with the extension
3. waits for approval if needed
4. creates the bridge object
5. runs your bookmarklet code

What authors should not need to manage directly:

- `window.postMessage`
- request / response envelopes
- `executionId`
- response correlation

### `bridge.get(url, options?)`

Use this for cross-origin GET requests handled by the extension.

Example:

```js
const me = await bridge.get("https://example.com/api/me");
```

Optional headers can be passed in `options.headers`.

### `bridge.post(url, body, options?)`

Use this for cross-origin JSON POST requests.

Example:

```js
await bridge.post("https://example.com/api/items", {
  hello: "world"
});
```

Optional headers can be passed in `options.headers`.

### `bridge.toast(message, options?)`

Use this for lightweight on-page feedback rendered by the extension.

Example:

```js
await bridge.toast("Saved", {
  variant: "success",
  durationMs: 2200
});
```

### `bridge.download({ filename, content, mimeType? })`

Use this to save generated text content through the browser download manager.

Example:

```js
await bridge.download({
  filename: "page-notes.md",
  content: `# ${document.title || "Untitled"}\n\n${location.href}`,
  mimeType: "text/markdown"
});
```

Important constraints:

- `content` is text, not an arbitrary binary blob
- filenames are sanitized before the browser sees them
- large payloads are rejected

### `bridge.copyText(text)`

Use this to copy generated text through the extension clipboard permission.

Example:

```js
await bridge.copyText([
  document.title || "Untitled",
  location.href
].join("\n"));
```

Important constraints:

- this action writes text only
- copied text is not retained in logs
- large clipboard payloads are rejected

## Suggested Bookmarklet Style

The bookmarklet should stay focused on:

- reading the current page
- preparing a small payload
- calling one or more bridge actions
- handling errors clearly

Example:

```js
runBookmarklet({
  name: "Memos quote saver",
  version: 1,
  async run(bridge) {
    const title = document.title || "Untitled";
    const url = location.href;
    const selection = window.getSelection ? String(window.getSelection()).trim() : "";

    let content = `**${title}**`;
    if (selection) {
      const quote = selection
        .split(/\r?\n/)
        .map((line) => (line.trim() ? `> ${line.trim()}` : ">"))
        .join("\n");
      content += `\n\n${quote}`;
    }
    content += `\n\n- [Source](${url})`;

    await bridge.post("https://mem.octosoc.eu/api/v1/memos", {
      content,
      visibility: "PRIVATE"
    });

    await bridge.download({
      filename: "memo-source.md",
      content,
      mimeType: "text/markdown"
    });

    await bridge.copyText(content);

    await bridge.toast("Memo added", {
      variant: "success",
      durationMs: 2200
    });
  }
});
```

## Approval Behavior

Approval is currently simple by design.

What happens today:

- an unknown bookmarklet prompts on registration
- `Allow` stores a persistent allow decision
- `Deny` stores a persistent deny decision
- dismissing the dialog stores nothing and stops execution

Approval identity is based on:

- `name`
- `version`
- readable source

That means you should treat a meaningful code change as a version-worthy change, because the extension will likely see it as a new definition anyway.

## What The Options Page Is For

The options page is the main development console for this experiment.

You can use it to:

- change global bridge settings
- inspect approved and denied bookmarklets
- review readable source and hashes
- inspect recent logs
- generate bookmarklets from a `run(bridge)` body

If behavior seems surprising, check the options page before changing code.

## Practical Authoring Workflow

1. Open the extension options page.
2. Go to `Generator`.
3. Write or paste the body of `run(bridge)`.
4. Keep the bookmarklet name stable.
5. Increment the version when the definition changes materially.
6. Build the bookmarklet and drag it to the bookmarks bar.
7. Run it on a normal page.
8. Review the approval dialog carefully.
9. Check logs and stored policy entries if something fails.

## Good Practices

- keep bookmarklets small and readable
- keep DOM scraping in the bookmarklet, not in the extension
- keep network URLs explicit
- send JSON-friendly payloads
- keep downloads small and explicit
- keep copied text deliberate and reviewable
- use toast messages for visible feedback
- bump the bookmarklet version when behavior changes materially

## Bad Practices

- manually building raw bridge envelopes
- treating inferred actions as a real security boundary
- pushing page-specific parsing into extension code without a strong reason
- hiding too much bookmarklet behavior inside generated helper code

## Common Pitfalls

### Re-running bookmarklets on the same page

If generated helper code declares top-level `const` bindings, repeated runs can collide.

The safe pattern is to wrap generated helper code in an IIFE:

```js
(function () {
  // helper and bookmarklet code
})();
```

### Hearing your own outbound `window.postMessage`

If the page helper listens too loosely, it may consume its own outbound request instead of the extension response.

The response listener should filter on:

- matching namespace
- matching request ID
- `typeof data.ok === "boolean"`

That last check is important.

### Approval keeps reappearing

Usually this means one of the identity inputs changed:

- name
- version
- readable source

### Request behavior is inconsistent

Check these in order:

1. the bookmarklet code in the page console
2. the extension log in the options page
3. global allowed origins in settings
4. headers and target URL

## Notes For Extension Developers

If you are changing the extension itself, the most important files are:

- `src/options/main.ts`: options page and generator behavior
- `src/content/bridge-listener.ts`: page relay logic
- `src/content/approval-modal.ts`: approval UI
- `src/background/router.ts`: central background controller
- `src/background/actions/`: concrete privileged action behavior
- `src/background/policy/`: identity, persistence, and execution session handling
- `src/shared/schema.ts` and `src/shared/types.ts`: shared contract

If you need the internal protocol details, read `SCHEMA.md` after this file.

## Summary

The project is easiest to work with when you keep the split clear:

- bookmarklet code handles page-specific logic
- the extension handles privilege, approval, and persistence
- the helper API stays small
