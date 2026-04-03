# AMO Review Notes

This file is for Mozilla Add-ons reviewers and for future release preparation.

It explains what the extension does, why it requests broad page access, and how the bridge is constrained. It is not the main developer guide for the codebase.

## What The Extension Does

Bookmarklet Bridge lets a user run their own bookmarklets against the current page while routing a small set of privileged actions through the extension:

- `bridge.get`
- `bridge.post`
- `bridge.toast`
- `bridge.download`

The extension does not download or execute remote extension code. The bookmarklet source is supplied by the user through a bookmark they install themselves, and the extension shows approval UI before a new bookmarklet can use the bridge.

## What This Product Is For

The extension exists for user-authored bookmarklets that need a very small amount of browser help.

Typical examples:

- posting selected text, page titles, and URLs to a note-taking or bookmarking service
- fetching authenticated API data from a service the user already uses
- showing lightweight in-page status feedback while a bookmarklet runs

The extension is not intended to be a general automation platform.

## Why Bookmarklets Are Still The Center

Bookmarklets are valuable because they are:

- explicitly run by the user
- easy to edit and tweak
- easy to share as source
- usually easier to audit than larger extension logic

This extension tries to preserve those strengths instead of replacing bookmarklets with opaque extension workflows.

## What The Bridge Exposes

Approved bookmarklets can use a small helper API:

- `bridge.get(url, options?)`
- `bridge.post(url, body, options?)`
- `bridge.toast(message, options?)`
- `bridge.download({ filename, content, mimeType? })`

The bridge also provides:

- a registration step for review and approval
- bookmarklet identity derived from name, version, and readable source
- readable source inspection in approval and options UI
- per-bookmarklet stored decisions
- recent execution logging without POST body or download content retention

The bridge does not expose arbitrary privileged extension APIs to page code.

## Why `"<all_urls>"` Is Requested

The extension uses a content script on arbitrary pages so bookmarklets can communicate with the extension regardless of which site the user is currently visiting.

Without broad host access:

- the page-side bookmarklet could not send bridge messages on arbitrary pages
- the content script could not show approval UI on the current page
- action results could not be relayed back consistently

The extension does not inject remote scripts. It injects only its bundled content script.

The broad permission is therefore about making the relay available on arbitrary pages, not about passive browsing surveillance.

## Why `downloads` Is Requested

The extension can save user-generated bookmarklet output through the browser download manager.

This permission is used only for the narrow `bridge.download` action:

- bookmarklets provide a filename and text content
- the extension asks the browser to create the download
- the extension does not gain arbitrary filesystem access

## Approval Model

New bookmarklets are not trusted automatically.

At registration time the extension:

- captures readable bookmarklet source
- derives a stable identity hash
- infers bridge actions for display
- prompts the user to allow or deny the bookmarklet

Allowed and denied decisions are stored locally.

If a user changes:

- the bookmarklet name
- the bookmarklet version
- the bookmarklet source

the extension treats that as a new bookmarklet definition for approval purposes.

## Data Transmission

The extension can transmit user-triggered bookmarklet data to remote endpoints through `bridge.get` and `bridge.post`, and it can save user-triggered generated text through `bridge.download`.

Typical transmitted data includes:

- current page URL
- current page title
- selected page text
- bookmarklet-generated request payloads
- user-provided request headers, which may include authentication data

The extension does not send telemetry to the developer. Data is transmitted only when a user runs an approved bookmarklet that requests a bridge action.

## Declared Data Categories

The manifest includes Gecko data collection metadata for:

- `authenticationInfo`
- `browsingActivity`
- `websiteActivity`
- `websiteContent`

That reflects the fact that user-authored bookmarklets may choose to send page-derived data and authentication-related headers through the bridge.

## Bundling And Build

The extension is bundled locally with:

- `npm install`
- `npm run build`
- `npm run lint:amo`

Main entry points:

- `src/background/index.ts`
- `src/content/index.ts`
- `src/options/main.ts`

Static assets are copied from `assets/`.

## Signing And Distribution

Current intended distribution mode:

- Firefox
- unlisted AMO signing
- self-distributed signed XPI

Signing workflow:

1. set `WEB_EXT_API_KEY`
2. set `WEB_EXT_API_SECRET`
3. run `npm run sign:unlisted`

The signed artifact is written to `web-ext-artifacts/`.

## Third-Party Code

- `highlight.js` is bundled for syntax highlighting in approval and options views

## Short Reviewer Summary

Bookmarklet Bridge is a narrow bridge for user-run bookmarklets. It does not fetch or execute remote extension code. Bookmarklet source is supplied by the user through their own bookmarks and is individually reviewed through an approval prompt before bridge access is granted.
