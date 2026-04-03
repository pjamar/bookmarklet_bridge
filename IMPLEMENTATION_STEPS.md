# Bookmarklet Bridge Implementation Notes

This file explains how the project moved from the original idea to the current implementation.

It is useful for a future maintainer because it records not just what exists, but which decisions turned out to matter in practice.

## What This Part Of The Repository Is

This is a transition document between planning and code.

It answers:

- what the implementation currently includes
- which simplifications were made
- which problems were already discovered once

## Current Direction

The implementation is built around a deliberately small public API:

```js
runBookmarklet({
  name: "Example",
  version: 1,
  async run(bridge) {
    await bridge.get("https://example.com/api/me");
    await bridge.post("https://example.com/api/items", { hello: "world" });
    await bridge.toast("Done");
    await bridge.download({ filename: "example.txt", content: "Saved" });
    await bridge.downloadUrl({ url: "https://example.com/file.pdf" });
    await bridge.copyText("Copied");
  }
});
```

The important simplification is that authors do not write raw bridge envelopes anymore.

## What Has Actually Been Implemented

### Page-side helper model

The generated bookmarklet helper currently handles:

- `runBookmarklet`
- `bridge.post`
- `bridge.get`
- `bridge.toast`
- `bridge.download`
- `bridge.downloadUrl`
- `bridge.copyText`
- one registration step per execution
- request / response correlation over `window.postMessage`

### Background runtime

The background side currently handles:

- registration
- approval checks
- allow / deny policy storage
- network action execution
- safe logging

### Options page

The options page currently handles:

- bridge settings
- approved bookmarklets
- denied bookmarklets
- bookmarklet detail inspection
- a bookmarklet generator
- recent logs

## Simplifications That Were Deliberate

Several earlier ideas were intentionally dropped or de-emphasized:

- bookmarklet authors do not declare capabilities in the public API
- bookmarklet authors do not declare target origins in the public API
- approval is handled once at registration time
- approval options are persistent `allow` and `deny`

That reduction in surface area is one reason the project is understandable at all.

## Practical Lessons From The Build

### 1. Generated bookmarklets need an IIFE

Without an IIFE, re-running a generated bookmarklet on the same page can throw top-level redeclaration errors.

The current helper and example bookmarklets avoid that by wrapping the generated source.

### 2. Page helpers can consume their own outbound messages

The page-side helper must not treat every matching `requestId` message as a response.

The safe filter requires:

- matching namespace
- matching request ID
- `typeof data.ok === "boolean"`

### 3. Simple approval is better than clever approval

The implementation became clearer once approval was reduced to:

- persistent `Allow`
- persistent `Deny`
- dismissal means no stored decision and no execution

### 4. Logs need to stay safe

The logging model is intentionally partial.

It records enough to understand behavior:

- action name
- URL for `get` and `post`
- toast text
- downloaded filename and size
- clipboard write size
- HTTP status
- error code

It avoids storing POST bodies, download contents, and copied clipboard text.

### 5. Stored data evolves

Older policy entries may not contain newer fields.

UI code and storage readers should therefore tolerate partial or older shapes instead of assuming everything was written by the latest version of the extension.

### 6. Review UI should stay self-contained

Syntax highlighting and inspection features should remain bundled locally.

The extension should not rely on runtime fetches just to render reviewable source.

## Suggested Follow-Up Work

The current implementation would benefit from:

- explicit storage migration helpers
- tests for helper message filtering
- tests for log pruning and safe logging rules
- periodic bundle-size review if the UI tooling grows

## Manual Testing Checklist

These are the main end-to-end checks that matter after changes:

- open the options page from the toolbar button
- approve a bookmarklet and inspect it in the Approved view
- deny a bookmarklet and inspect it in the Denied view
- dismiss approval and confirm execution does not continue
- run `toast`, `get`, `post`, `download`, `downloadUrl`, and `copyText` examples
- verify logs appear without POST body, download content, or clipboard text data
- clear the log and verify it empties
- re-run a generated bookmarklet on the same page and verify no redeclaration error occurs

## How To Use This File

Use this document when you want implementation context and maintenance guidance.

Use `ARCHITECTURE.md` for structure and `DEVELOPER.md` for the public authoring model.
