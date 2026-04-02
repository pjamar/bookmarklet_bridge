# Manifest V3 Plan

This project now has two explicit packaging targets:

- Firefox: `dist/firefox`, still using Manifest V2 background scripts
- Chrome: `dist/chrome`, using Manifest V3 with `background.service_worker`

That split is deliberate.
It reflects the browser platform reality as of April 2, 2026:

- Chrome requires Manifest V3 and uses an extension service worker for background logic.
- MDN documents that Firefox still does not support `background.service_worker` and continues to use background scripts when present.

## What Is Already Done

- active execution sessions now persist in `browser.storage.local`
- background event listeners are registered at top level
- toolbar wiring now supports both `browser.browserAction` and `browser.action`
- the build pipeline can emit a Firefox package and a Chrome MV3 package from the same source tree

These changes remove the most obvious blocker for a service-worker background: assuming process memory is durable.

## What Still Needs Verification

1. Load `dist/chrome/manifest.json` as an unpacked extension in Chrome.
2. Verify register -> approve -> action flows for `get`, `post`, and `toast`.
3. Confirm the options page opens from the toolbar action in Chrome.
4. Confirm background restarts do not break an already approved execution in the same tab.
5. Check whether any Chrome-specific API shims are needed beyond the current `browser.action` fallback.

## Current Architectural Position

The project should stay dual-manifest for now.

Reason:

- the Chrome target needs MV3 now
- Firefox support for `background.service_worker` is still not a safe baseline for this extension
- the source code is already closer to event-driven assumptions after persisting execution sessions

When Firefox service-worker support is viable for this project, the next step can be simplifying toward one MV3-first runtime model instead of maintaining Firefox MV2 behavior indefinitely.
