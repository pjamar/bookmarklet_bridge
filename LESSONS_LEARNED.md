# Lessons Learned

This file captures details that are easy to miss when reading the code for the first time.

The project is still being reviewed incrementally, so this document is intentionally practical: it records the things that already caused confusion once and are likely to cause confusion again.

## Page Messaging

### The helper can hear its own outbound message

If the page-side helper listens only for matching namespace and request ID, it may consume the original outbound request rather than the response from the extension.

The reliable filter is:

- matching namespace
- matching request ID
- `typeof data.ok === "boolean"`

That last check is what distinguishes responses from outbound requests.

## Generated Bookmarklets

### Repeated runs can collide on top-level declarations

Bookmarklets may be run multiple times on the same page.

If generated helper code declares top-level bindings, repeated execution can fail with redeclaration errors.

The safe pattern is to wrap the generated code in an IIFE.

### Approval changes when the bookmarklet definition changes

The extension treats approval as attached to bookmarklet identity, not just to a bookmarklet name.

Changing any of these can trigger a new approval prompt:

- name
- version
- readable source

## Extension Constraints

### The options page cannot rely on eval-style syntax checking

Extension CSP blocks patterns such as `new Function(...)`.

That means generator validation needs parser-friendly or structurally safe approaches rather than runtime compilation tricks.

## Logging And Review

### Safe logs are more useful than complete logs

For this project, the goal of logging is reviewability and debugging, not full traffic capture.

That is why the extension keeps things like:

- action kind
- target URL
- status
- error code

and intentionally avoids storing POST bodies.
It also intentionally avoids storing downloaded file contents or copied clipboard text.

## Packaging

### Explicit asset copying is easier to reason about

The build is clearer when it copies known files into browser-specific build directories instead of treating the whole asset tree as a black box.

The current important assets are:

- `assets/manifest.firefox.json`
- `assets/manifest.chrome.json`
- `assets/icons/`
- `src/options/index.html`

### The Gecko extension ID should remain stable

Changing `browser_specific_settings.gecko.id` effectively creates a different add-on as far as Firefox update continuity is concerned.

## AMO / Release Process

### Data collection metadata matters

For Firefox submission, the manifest needs the Gecko data collection metadata that explains what categories of user data may be involved.

### Lint warnings still deserve attention

Even when a warning does not block local iteration, it still matters. This experiment is easier to maintain when warnings are understood and documented rather than ignored.

## Product Framing

### The value of bookmarklets is still the value of explicit user action

One of the strongest reasons this project makes sense at all is that bookmarklets are:

- explicitly run by the user
- easy to share
- easy to inspect
- easy to tweak

The extension should support those strengths, not bury them under too much hidden machinery.
