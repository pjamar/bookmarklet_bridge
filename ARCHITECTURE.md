# Bookmarklet Bridge Architecture

This document explains the project as it exists today, not as a final polished platform.

The codebase was assembled experimentally and is still being reviewed little by little. The structure is already coherent enough to work, but some decisions should still be treated as pragmatic implementation choices rather than finished architecture.

## High-Level Model

Bookmarklet Bridge splits work across three runtimes:

1. page context
2. content script context
3. background context

Each runtime has a different trust level and a different job.

## Runtime Responsibilities

### 1. Page Context

This is where the bookmarklet runs.

Responsibilities:

- collect data from the page
- define the bookmarklet's actual workflow
- call the helper API

Important constraint:

- page code is untrusted and should never be treated as if it already has extension privileges

### 2. Content Script Context

This is the relay layer on arbitrary pages.

Responsibilities:

- listen for page messages
- forward valid bridge messages to the background script
- show the approval modal when required
- show in-page toast UI when requested
- send responses back to the page with `window.postMessage`

Why it exists:

- the bookmarklet cannot talk directly to the privileged background script
- approval UI has to appear on the page where the bookmarklet was run

### 3. Background Context

This is the privileged part of the extension.

Responsibilities:

- validate messages
- compute bookmarklet identity
- enforce allow / deny policy
- run privileged actions
- persist settings, policies, and logs

This is the only place that should execute network actions on behalf of the bridge.

Today that background runtime is packaged in two browser-specific ways:

- Firefox build: background script
- Chrome build: Manifest V3 service worker

That difference is why background state must be treated as disposable process memory, not durable state.

## End-To-End Flow

### Registration

Registration happens once per bookmarklet execution.

1. the page helper builds a registration message
2. the content script forwards it to the background script
3. the background script computes the bookmarklet identity
4. the background script checks the stored decision for that identity
5. if the bookmarklet is unknown, the content script opens the approval modal
6. the user's decision is stored
7. if allowed, the current execution session is registered
8. the page helper continues and exposes the `bridge` methods to the bookmarklet

### Actions

After registration succeeds, the bookmarklet can issue actions.

1. the bookmarklet calls `bridge.get`, `bridge.post`, or `bridge.toast`
2. the helper sends an action message with the same `executionId`
3. the content script relays the message
4. the background script checks that the execution was registered
5. the action runs
6. a safe log entry is written
7. the response is sent back to the page

## Why Approval Is Per Bookmarklet

The project does not grant a blanket "trusted page script" permission.

Instead, it stores approval per bookmarklet definition. The definition is derived from:

- bookmarklet name
- bookmarklet version
- canonicalized readable source

That design keeps the review step attached to the thing the user actually runs: the bookmarklet itself.

It also means that changing source or version is expected to trigger a new approval.

## Trust Boundaries

### Untrusted Boundary

Everything coming from the page should be treated as hostile input, even if the bookmarklet was written by the same developer who wrote the extension.

Practical consequence:

- every bridge message still needs schema validation

### Semi-Trusted Boundary

The content script is extension code, but it runs in a page-facing environment.

Practical consequence:

- it should be a thin relay and UI layer, not a place for long-lived sensitive logic

### Trusted Boundary

The background script is the privileged authority.

Practical consequence:

- policy, validation, action dispatch, and persistence should stay here

## Main Modules

### `src/content/bridge-listener.ts`

Central relay for page messages.

It:

- filters messages by namespace and version
- forwards them through `browser.runtime.sendMessage`
- handles the approval-required case
- shows toasts for successful `toast` actions
- posts the final response back to the page

### `src/content/approval-modal.ts`

Renders the approval UI shown when a bookmarklet is not yet known.

The modal is a major part of the human review story because it shows:

- bookmarklet name
- version
- readable source
- hashes and inferred actions

### `src/background/router.ts`

This is the central controller for the bridge.

It:

- parses bridge messages
- distinguishes registration from actions
- checks execution session state
- dispatches `get`, `post`, and `toast`
- writes execution and error logs
- handles internal messages from the options page

If another developer wants to understand control flow quickly, this is one of the best files to read first.

### `src/background/policy/`

Owns bookmarklet approval decisions and execution session registration.

Important split:

- `hash.ts` builds bookmarklet identity
- `approval.ts` applies allow / deny logic
- `store.ts` persists policy entries
- `session-store.ts` tracks currently approved executions

`session-store.ts` now persists active execution state to extension storage so a restarted background context can recover it.

### `src/background/actions/`

Contains the concrete implementations of privileged actions.

Current actions:

- `get`
- `post`
- `toast` is routed in the background and rendered by the content script

### `src/background/log/`

Stores a recent execution history for debugging and review.

The logging model is intentionally limited: enough to understand what happened, not enough to casually retain full request payloads.

### `src/options/main.ts`

This file drives the options page, which acts as:

- settings UI
- policy browser
- log viewer
- bookmarklet generator / IDE

It is large because it currently concentrates most human-facing extension tooling in one place.

## Stored Data

The extension stores three broad classes of data:

### Settings

Global bridge configuration such as:

- optional allowed origins
- default request timeout
- default toast duration

### Policies

Per-bookmarklet records containing:

- allow or deny decision
- definition hash
- source hash
- readable source
- inferred actions
- timestamps

### Logs

Recent execution summaries such as:

- registration allowed / denied
- action type
- URL for network requests
- toast text
- HTTP status when available
- error code on failure

The project intentionally avoids logging POST bodies.

## Options Page As Part Of The Architecture

The options page is not an afterthought. It is part of how the project stays understandable.

It gives developers and users a way to inspect:

- what bookmarklets have been approved
- what source was actually reviewed
- what actions were inferred
- what requests were attempted

Without that view, this experiment would be much harder to audit.

## Build And Packaging

The build pipeline is intentionally simple:

1. TypeScript entry points are bundled with `esbuild`
2. browser-specific manifests and static assets are copied into browser-specific build directories
3. `web-ext` works from `dist/firefox/` for linting, packaging, and signing

Primary packaged outputs:

- Firefox package: `dist/firefox/`
- Chrome package: `dist/chrome/`

## Current Architectural Tradeoffs

These are the main tradeoffs another developer should keep in mind:

- the public bookmarklet API is intentionally much simpler than the internal message protocol
- broad host access is used so the bridge works on arbitrary pages
- approval is review-oriented, not a perfect security sandbox
- the options page currently carries a lot of product and debugging responsibility
- some parts of the project are still evolving because the codebase is being reviewed incrementally while the author learns the extension model

## Where To Start If You Want To Change Something

- change bridge behavior: `src/background/router.ts` and `src/background/actions/`
- change approval rules: `src/background/policy/`
- change page relay behavior: `src/content/bridge-listener.ts`
- change review UX: `src/content/approval-modal.ts`
- change the generator or inspection UI: `src/options/main.ts`
