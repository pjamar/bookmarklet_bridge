# Bookmarklet Bridge Plan

This file explains the original intent of the experiment.

It is not the source of truth for implementation details anymore. Instead, it answers a simpler question: what was this project trying to become, and what constraints shaped the current codebase?

## Why This Project Exists

The project started from a narrow problem:

- bookmarklets are easy to write, inspect, and share
- bookmarklets are bad at privileged browser work
- a full browser extension often feels too heavy for small one-off workflows

The experiment tries to preserve the good parts of bookmarklets while adding a tiny amount of extension help.

## Main Goal

Build a Firefox extension that gives bookmarklets a small privileged bridge without turning them into hidden extension code.

The practical product goals are:

- easy to write by hand
- easy to inspect before approval
- easy to debug when something fails
- easy to tweak without understanding every internal message shape

## Intended Public Model

The public shape should stay small:

```js
runBookmarklet({
  name: "Memos quote saver",
  version: 1,
  async run(bridge) {
    await bridge.post("https://mem.octosoc.eu/api/v1/memos", {
      content: "Hello"
    });
    await bridge.toast("Saved");
  }
});
```

The bridge internals may be structured and strict, but bookmarklet authors should not have to manage transport details by hand.

## Non-Goals

The extension is not trying to be:

- a general automation platform
- a way to execute bookmarklet code in privileged extension context
- a declarative permission system where bookmarklet authors maintain raw capability metadata

The intended split is:

- bookmarklet logic stays in the page
- privileged operations stay in the extension

## Supported Bridge Actions

The current planned action set is intentionally small:

- `post`
- `get`
- `toast`

Anything beyond that should have a strong reason, because increasing the action surface increases review and maintenance cost.

## Product Decisions That Shaped The Build

These were the core decisions behind the implementation:

1. Bookmarklet ergonomics matter as much as technical correctness.
2. Approval is attached to bookmarklet identity, not just to a site.
3. Approval is based on name, version, and readable source.
4. Approval choices are persistent `Allow` and `Deny`.
5. Dismissing approval should not silently continue execution.
6. Review UI should show inferred action hints and readable source.
7. Logs should be useful for debugging without storing sensitive request bodies.

## What `runBookmarklet()` Is Supposed To Hide

The helper exists so bookmarklet authors do not need to manually:

- create request envelopes
- manage `executionId`
- correlate raw `window.postMessage` responses
- maintain declared capabilities or origin lists inside bookmarklet code

That transport complexity belongs inside the helper and the extension.

## Review And Approval Expectations

The approval flow should make a bookmarklet understandable to a human reviewer.

That means the UI should show:

- bookmarklet name
- bookmarklet version
- readable source
- source hash
- inferred actions when they can be detected

The options page should make stored decisions reviewable later as well.

## Logging Expectations

The log should help answer:

- what bookmarklet ran
- whether it was allowed or denied
- which action ran
- which URL was involved
- whether it succeeded or failed

The log should avoid becoming a data leak. In particular, POST bodies should not be stored.

## UX Expectations

The project should be understandable from the extension itself, not only from the code.

That is why the options page is expected to include:

- settings
- approval review views
- execution logs
- a bookmarklet generator

The extension toolbar button should also open that UI directly.

## Lessons That Emerged During The Experiment

Several practical issues shaped the current direction:

- generated bookmarklets should be wrapped in an IIFE
- response listeners must avoid consuming outbound `postMessage` requests
- review tooling needs to tolerate older stored entries as the experiment evolves

## How To Read This File Today

Use this document as project intent and historical framing.

If you want current behavior, read:

- `README.md`
- `ARCHITECTURE.md`
- `DEVELOPER.md`
- `SCHEMA.md`
