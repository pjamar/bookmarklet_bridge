# Bookmarklet Bridge Schema

This document describes the internal contract behind the bridge.

Most developers should read this after `README.md`, `ARCHITECTURE.md`, and `DEVELOPER.md`. The public idea is intentionally simpler than the internal wire format.

## Public API Versus Internal Protocol

Bookmarklet authors are meant to think in terms of:

```js
runBookmarklet({
  name: "Example",
  version: 1,
  async run(bridge) {
    await bridge.get("https://example.com/api/me");
    await bridge.post("https://example.com/api/items", { hello: "world" });
    await bridge.toast("Done");
    await bridge.download({ filename: "example.txt", content: "Saved" });
  }
});
```

Internally, the helper turns that into:

1. one registration message
2. zero or more action messages
3. one response per request

## Namespace And Version

Bridge messages are identified by:

- `namespace: "bookmarklet-bridge"`
- `version: 2`

Those fields let the content script quickly ignore unrelated page messages.

## Registration Message

Registration is sent before any privileged action can run.

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  kind: "register",
  requestId: "unique-string",
  executionId: "unique-per-run",
  bookmarklet: {
    name: "Example",
    version: 1,
    source: "async run(bridge) { ... }"
  }
}
```

Important points:

- `executionId` is per execution, not per bookmarklet forever
- `source` should be readable source, not only the minified bookmarklet URL
- approval is checked at registration time

## Action Messages

After registration succeeds, actions reuse the same `executionId`.

### `post`

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  kind: "action",
  requestId: "unique-string",
  executionId: "same-execution-id",
  action: "post",
  payload: {
    url: "https://example.com/api/items",
    body: { hello: "world" },
    headers: {
      "Content-Type": "application/json"
    }
  }
}
```

### `get`

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  kind: "action",
  requestId: "unique-string",
  executionId: "same-execution-id",
  action: "get",
  payload: {
    url: "https://example.com/api/me",
    headers: {
      "Authorization": "Bearer token"
    }
  }
}
```

### `toast`

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  kind: "action",
  requestId: "unique-string",
  executionId: "same-execution-id",
  action: "toast",
  payload: {
    message: "Saved",
    variant: "success",
    durationMs: 2200
  }
}
```

### `download`

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  kind: "action",
  requestId: "unique-string",
  executionId: "same-execution-id",
  action: "download",
  payload: {
    filename: "page-notes.md",
    content: "# Saved",
    mimeType: "text/markdown"
  }
}
```

## Validation Rules

### Common Rules

- the message must be JSON-serializable
- namespace must match
- version must match
- `requestId` must identify one request
- `executionId` must stay stable within one bookmarklet run

### Registration Rules

- `bookmarklet.name` is required
- `bookmarklet.version` is required
- `bookmarklet.source` must be non-empty readable text

### `get` Rules

- `payload.url` must be a full URL
- request bodies are not allowed
- headers must be string pairs if provided

### `post` Rules

- `payload.url` must be a full URL
- `payload.body` must be JSON-serializable
- headers must be string pairs if provided

### `toast` Rules

- `payload.message` is required
- `variant` is optional
- `durationMs` is optional and clamped

### `download` Rules

- `payload.filename` must be non-empty text
- `payload.content` must be non-empty text
- `payload.mimeType` is optional
- payload size is capped

## Response Shape

Successful responses:

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  requestId: "same-request-id",
  ok: true,
  result: {}
}
```

Failed responses:

```js
{
  namespace: "bookmarklet-bridge",
  version: 2,
  requestId: "same-request-id",
  ok: false,
  error: {
    code: "approval_required",
    message: "Bookmarklet approval is required."
  }
}
```

The page helper should treat `ok` as the success switch.

## Error Codes In Practice

The current system can return codes such as:

- `approval_required`
- `approval_dismissed`
- `denied`
- `invalid_request`
- `unsupported_action`
- `origin_not_allowed`
- `payload_too_large`
- `network_error`
- `timeout`
- `download_failed`
- `bridge_internal_error`

Not every code will appear in every path, but these are the meaningful categories for callers and logs.

## Approval Metadata

During registration, the extension also derives review-oriented metadata:

- `definitionHash`
- `sourceHash`
- `canonicalBookmarklet`
- `decodedSource`
- inferred actions such as `get`, `post`, `toast`, and `download`

Important limitation:

- inferred actions are useful for human review
- they are not a real security boundary

## Logging Model

The extension keeps a recent local log to make the experiment understandable and debuggable.

Entries may include:

- timestamp
- execution ID
- bookmarklet name and version
- event kind
- action kind
- target URL for network actions
- toast text
- downloaded filename, mime type, and size
- HTTP status
- error code

The design intentionally avoids logging POST bodies and download contents.

## Two Easy-To-Miss Implementation Details

### Response listeners should not consume outbound requests

Because the page helper and the content script both use `window.postMessage`, the helper can accidentally hear its own outbound request if the response filter is too loose.

A safe response listener checks:

- namespace
- request ID
- `typeof data.ok === "boolean"`

### Generated bookmarklets should use an IIFE

Running the same bookmarklet repeatedly on a page can cause top-level binding collisions unless the generated code is wrapped.

## Summary

The internal contract is deliberately small:

- register once per execution
- approve per bookmarklet definition
- run simple action messages after registration

That keeps the public bookmarklet model readable while still giving the extension enough structure to validate, log, and review behavior.
