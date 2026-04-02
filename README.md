# Bookmarklet Bridge

Bookmarklet Bridge is a Firefox extension experiment for bookmarklets that need a small amount of privileged help from the browser.

The current bridge exposes three actions:

- `bridge.get(...)`
- `bridge.post(...)`
- `bridge.toast(...)`

The project is currently vibe-coded and being reviewed little by little while its author learns more about building browser extensions. That matters for the documentation: the goal here is to describe what the project currently does, where the moving parts live, and how another developer can tweak it without having to reconstruct the whole idea from the code first.

Despite the experimental state, the extension seems to be working fine for the bookmarklet workflows it was built for.

## What Problem This Project Solves

Normal bookmarklets are good at page-level scripting, but they are weak at privileged browser tasks such as:

- making cross-origin requests reliably
- keeping approval decisions outside page scripts
- showing extension-controlled UI on arbitrary pages

This extension keeps the bookmarklet itself as the user-facing unit, then routes a very small set of privileged actions through the extension.

The intended result is:

- bookmarklet logic stays readable
- privileged actions stay centralized
- approval is tied to the bookmarklet, not to an entire site
- developers can inspect source and tweak behavior without needing to understand every transport detail up front

## Current Product Shape

The extension has four main responsibilities:

1. receive bookmarklet messages from the current page
2. ask for approval when a bookmarklet is new or has changed
3. execute privileged bridge actions in the background script
4. provide an options page for settings, policy review, logs, and bookmarklet generation

The project currently targets Firefox and is packaged as a traditional WebExtension.

## Repository Tour

- `src/background/`: approval checks, routing, network actions, settings, and logs
- `src/content/`: page bridge listener, approval modal, and toast rendering
- `src/options/`: options page UI for settings, policy inspection, logs, and the bookmarklet generator
- `src/shared/`: shared types, constants, schema validation, canonicalization, and helpers
- `assets/`: manifest and packaged static assets
- `examples/`: simple pages for local testing
- `scripts/build.mjs`: build script that bundles the extension into `dist/`

## How The Extension Works

There are three runtime contexts:

- page context: where the bookmarklet itself runs
- content script context: the relay between the page and the extension, plus on-page UI
- background context: the privileged extension logic

The normal flow is:

1. a bookmarklet calls `runBookmarklet({ name, version, run })`
2. the helper registers that bookmarklet with the extension
3. the extension checks whether this bookmarklet identity was already allowed or denied
4. if needed, the content script shows an approval modal on the current page
5. once approved, the bookmarklet can call `bridge.get`, `bridge.post`, and `bridge.toast`
6. the background script validates the action, executes it, and records a safe log entry

Approval is tied to bookmarklet identity derived from:

- `name`
- `version`
- readable source derived from the bookmarklet

If any of those change, the extension treats it as a new bookmarklet definition.

## Options Page

The options page is not just settings. It is also the main inspection tool for the experiment.

It currently includes:

- global bridge settings
- lists of approved and denied bookmarklets
- a detailed view of stored bookmarklet source and hashes
- a recent execution log
- a generator / IDE for writing the body of `run(bridge)` and producing a bookmarklet URL

That makes it the best place to start when trying to understand what the extension is doing in practice.

## Main Documentation

Read the docs in this order:

1. `README.md`: project overview, workflow, and where things live
2. `ARCHITECTURE.md`: runtime model and module responsibilities
3. `DEVELOPER.md`: bookmarklet authoring model and extension development notes
4. `SCHEMA.md`: internal message shapes and validation rules
5. `LESSONS_LEARNED.md`: implementation details and edge cases discovered during the experiment

Two other files are intentionally secondary:

- `PLAN.md`: earlier planning notes
- `IMPLEMENTATION_STEPS.md`: implementation history / checklist

Those files are useful as historical context, but they are not the best entry point for understanding the current project.

## Local Development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

The build output is written to `dist/`.

Load it temporarily in Firefox:

1. open `about:debugging#/runtime/this-firefox`
2. choose `Load Temporary Add-on`
3. select `dist/manifest.json`

After source changes:

1. run `npm run build`
2. reload the temporary add-on in Firefox

## Useful Commands

- `npm run build`: bundle the extension into `dist/`
- `npm run lint:amo`: run `web-ext lint` on the built extension
- `npm run package:extension`: build a local ZIP in `web-ext-artifacts/`
- `npm run sign:unlisted`: submit the build for Mozilla unlisted signing
- `npm run clean`: remove build artifacts

## What To Verify Manually

When changing behavior, the main flows to test are:

- the toolbar button opens the options page
- the generator can build a bookmarklet URL
- a new bookmarklet triggers approval
- an approved bookmarklet can call `bridge.get`
- an approved bookmarklet can call `bridge.post`
- an approved bookmarklet can call `bridge.toast`
- policy and log views update as expected

## Signing And Distribution

The current intended distribution path is:

- Firefox
- unlisted AMO signing
- self-distributed signed XPI

Before signing:

1. export `WEB_EXT_API_KEY`
2. export `WEB_EXT_API_SECRET`
3. run `npm run build`
4. run `npm run lint:amo`
5. run `npm run sign:unlisted`

Important packaging details:

- `assets/manifest.json` is the source of truth for packaged metadata
- the Gecko extension ID should stay stable
- `scripts/build.mjs` copies the manifest, icons, and options HTML into `dist/`

## Notes For Future Tweaks

If you want to modify the project, the most common entry points are:

- `src/options/main.ts` for the options page and generator UX
- `src/content/bridge-listener.ts` for page-to-extension message handling
- `src/content/approval-modal.ts` for approval UI behavior
- `src/background/router.ts` for message routing and error handling
- `src/background/actions/` for bridge action behavior
- `src/background/policy/` for approval identity and policy storage

If you are unsure where to start, read `ARCHITECTURE.md` before changing code.
