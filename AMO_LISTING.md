# AMO Listing Draft

This file contains reusable listing and submission text for Mozilla Add-ons.

It is meant to support release work, reviewer communication, and store metadata. It is not the main place to learn how the code works.

## Summary

Bookmarklet Bridge gives user-run bookmarklets a small, reviewable bridge for cross-origin `GET`, `POST`, and in-page toast feedback.

## Description

Bookmarklet Bridge is a Firefox add-on for people who write or install their own bookmarklets and want a constrained way to give those bookmarklets a few privileged capabilities.

The extension provides a small helper model:

- `runBookmarklet({ name, version, run })`
- `bridge.get(url, options?)`
- `bridge.post(url, body, options?)`
- `bridge.toast(message, options?)`

This keeps bookmarklets readable and easy to audit while still enabling workflows that normal page JavaScript cannot reliably perform on arbitrary websites.

Typical use cases:

- save selected text, page title, and URL to a notes service
- call an authenticated API from a bookmarklet
- show lightweight status feedback on the current page

Each bookmarklet is explicitly run by the user and must be individually approved before it can use the bridge. Approval is tied to bookmarklet identity derived from its name, version, and readable source.

The extension is intentionally narrow. It is not a general automation platform and does not expose arbitrary extension internals to page scripts.

## Why Bookmarklets

Bookmarklets remain useful because they are:

- explicitly user-triggered
- easy to tweak for a specific site or workflow
- easy to share between technical users
- usually easy to audit because the source is small and visible

Bookmarklet Bridge keeps those strengths while adding a constrained path for network requests and in-page feedback.

## Permissions Explanation

### `"<all_urls>"`

The extension uses a content script on arbitrary pages so a bookmarklet can communicate with the extension regardless of which site the user is visiting.

This permission is needed so the extension can:

- receive page-side bridge messages
- show bookmarklet approval UI on the current page
- return action results to the page bookmarklet
- support bookmarklets on arbitrary sites instead of a fixed site list

The extension does not use this permission to inject remote scripts or run passive background automation across sites.

### `storage`

Used to store:

- bridge settings
- per-bookmarklet allow / deny decisions
- recent local execution logs

## Privacy / Data Use

Bookmarklet Bridge does not send telemetry to the developer.

The extension only transmits data when the user explicitly runs an approved bookmarklet that calls `bridge.get` or `bridge.post`.

Depending on the bookmarklet, transmitted data may include:

- current page URL
- current page title
- selected page text
- bookmarklet-generated request bodies
- user-provided request headers, including authentication headers where relevant

The extension stores local approval decisions and recent execution logs, but it intentionally does not store POST bodies in the log.

## Reviewer Notes Short Form

Bookmarklet Bridge is a narrow bridge for user-run bookmarklets. It does not fetch or execute remote extension code. Bookmarklet source is supplied by the user through their own bookmarks and is individually reviewed through an approval prompt before bridge access is granted.

The `"<all_urls>"` host permission is required so the content script can relay bookmarklet messages and show approval/results on whatever site the user is currently visiting.

## Support

Suggested support text:

- Support: use the repository issue tracker or contact the maintainer directly
- Source: provide the repository URL used for AMO submission
- Documentation: point reviewers and users to `README.md` and `DEVELOPER.md`

## Release Notes Template

### Initial Release

- Adds a Firefox bridge for bookmarklets that need cross-origin `GET`, `POST`, and in-page toast feedback
- Includes per-bookmarklet approval, policy storage, and recent execution logging
- Includes an options-page bookmarklet IDE and review tooling

### Patch Release Template

- Fixes bookmarklet helper generation
- Improves approval or logging behavior
- Updates options UI and documentation
- Refreshes packaging, signing, or icon assets

## Submission Checklist

- Fill AMO summary from the `Summary` section above
- Fill AMO description from the `Description` section above
- Keep `AMO_REVIEW.md` aligned with actual behavior
- Confirm the version in `assets/manifest.json`
- Run `npm run build`
- Run `npm run lint:amo`
- Run `npm run sign:unlisted`
