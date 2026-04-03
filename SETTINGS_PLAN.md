# Bookmarklet Settings Plan

This document captures the current design direction for bookmarklet-scoped settings.

The goal is not to add a generic key/value store.
The goal is to add a user-visible, bookmarklet-specific settings model that stays understandable in approval and management UI.

## Product Framing

The feature should be framed as:

- bookmarklet-scoped settings
- declared by the bookmarklet
- visible and editable in the extension UI
- readable by the bookmarklet at runtime

It should not be framed as:

- arbitrary extension storage
- hidden bookmarklet persistence
- a place for bookmarklets to store opaque blobs

That distinction matters because the trust model depends on users being able to see:

- what settings exist
- what each setting is for
- what values are currently stored

## Core Principles

1. Settings belong to one bookmarklet definition.
2. The bookmarklet must declare the schema up front.
3. Users must be able to inspect and edit values in the extension UI.
4. Types must be simple and restricted.
5. The first version should be read-only from the bookmarklet side.

## Recommended First Feature Set

### Bookmarklet Declaration

Extend the public bookmarklet API with an optional `settings` field:

```js
runBookmarklet({
  name: "Example",
  version: 1,
  extendedDescription: "## What this does\n\nUses configurable defaults.",
  settings: {
    visibility: {
      type: "option",
      label: "Default visibility",
      description: "Used when creating new notes.",
      options: ["PRIVATE", "PUBLIC"],
      default: "PRIVATE"
    },
    includeSelection: {
      type: "boolean",
      label: "Include selected text",
      description: "If enabled, append selected text to the note.",
      default: true
    },
    timeoutSeconds: {
      type: "integer",
      label: "Timeout seconds",
      description: "Maximum wait before the bookmarklet stops waiting.",
      default: 10,
      min: 1,
      max: 60
    }
  },
  async run(bridge) {
    const settings = await bridge.getSettings();
  }
});
```

### Bridge API

The first bookmarklet-facing runtime API should be read-only:

- `bridge.getSettings()`

That should return validated current values merged against defaults for the current bookmarklet definition.

Possible later additions:

- `bridge.openSettings()`
- `bridge.setSetting(key, value)`

Those should not be part of the first version.

## Supported Field Types

The allowed setting types should be:

- `boolean`
- `text`
- `integer`
- `float`
- `option`

Each field must include:

- `type`
- `label`
- `description`
- `default`

Type-specific fields:

### `boolean`

- `default: boolean`

### `text`

- `default: string`
- optional `placeholder: string`
- optional `multiline: boolean`
- optional `maxLength: number`

No field-specific semantic validation should be added in V1.
In particular, `text` should remain plain text without URL, email, pattern, or trimming rules beyond basic type validation.

### `integer`

- `default: number`
- optional `min: number`
- optional `max: number`
- optional `step: number`

### `float`

- `default: number`
- optional `min: number`
- optional `max: number`
- optional `step: number`

### `option`

- `default: string`
- `options: string[]`

## Things To Exclude From V1

Do not include these initially:

- nested objects
- arrays
- arbitrary JSON
- password/secret fields
- hidden settings
- bookmarklet-controlled writes without UI visibility
- bookmarklet-created keys outside the declared schema

## Storage Model

The storage should be split into two concepts:

1. declared schema for a bookmarklet definition
2. current user-chosen values for that definition

Both are scoped strictly to `definitionHash`.
V1 should not attempt continuity across different bookmarklet definitions, even when they look like upgrades of the same bookmarklet.

Suggested keys:

- schema keyed by `definitionHash`
- values keyed by `definitionHash`

Suggested shape:

```ts
type BookmarkletSettingsSchemaMap = Record<string, BookmarkletSettingsSchema>;
type BookmarkletSettingsValueMap = Record<string, BookmarkletSettingsValues>;
```

Where:

- `BookmarkletSettingsSchema` is the validated field definition set
- `BookmarkletSettingsValues` is the validated current value set

## Approval UI Behavior

When a bookmarklet declares settings, the approval popup should show:

- a summary that the bookmarklet declares configurable settings
- each field label
- field type
- description
- default value

That lets the user understand what the bookmarklet expects before allowing it.

The existing extended Markdown description should remain separate from settings metadata.
The description explains what the bookmarklet does.
The settings schema explains what can be configured.

## Options / Management UI Behavior

The bookmarklet detail view for approved entries should gain a settings section.
Denied entries should not expose editable settings controls in V1.

For each field, show:

- label
- type
- description
- current value
- default value

Controls by type:

- `boolean`: checkbox or toggle
- `text`: input or textarea
- `integer`: numeric input
- `float`: numeric input with step support
- `option`: select

Additional actions:

- reset one field to default
- reset all fields to defaults

## Validation Rules

### Schema Validation

The extension should reject settings schemas that:

- exceed field-count limits
- use duplicate keys
- use unsupported field types
- omit required metadata
- provide invalid defaults
- provide invalid numeric bounds
- provide empty option lists
- use defaults not present in option lists

The extension should not add extra semantic validation beyond schema shape and simple type compatibility in V1.
For example, text fields should not enforce URL formats, regexes, normalization rules, or domain-specific constraints.

### Value Validation

Values loaded from storage must be normalized against the schema:

- missing values fall back to defaults
- invalid values reset to defaults
- removed fields disappear

## Suggested Limits

These limits should keep the feature understandable:

- max settings per bookmarklet: 20
- max label length: 80
- max description length: 500
- max text default length: 2000
- max option count per field: 20
- max option length: 80

These are rough starting points and can be tuned later.

## Schema Evolution Behavior

When a bookmarklet changes version or source, it may already trigger a new approval because identity changes.

Within that model, settings migration can stay simple:

- new bookmarklet definition gets its own schema
- new `definitionHash` gets its own values
- values start from defaults

V1 should not migrate settings across hashes.
If the project later wants continuity across versions, that should be a separate migration feature, not hidden inside V1.

## Logging

The logging model should remain conservative.

Logs may include:

- that settings were read
- that settings were changed in the options UI

Logs should not include:

- full text values
- large setting payloads
- anything that feels like secret retention

## Security / Trust Position

This feature should not require new browser permissions beyond existing `storage`.

The real risk is not manifest permission expansion.
The real risk is bookmarklets storing opaque state without user visibility.

That is why the following are mandatory for the design:

- declared schema
- visible descriptions
- editable values in the extension UI
- no arbitrary write-anything API in V1

## Recommended Implementation Order

1. Add schema types and validation in shared types/schema.
2. Extend bookmarklet registration to carry declared settings schema.
3. Persist schema alongside policy entries.
4. Show schema in approval and detail UI.
5. Add settings value storage and normalization.
6. Add options-page editing controls per field type.
7. Add `bridge.getSettings()`.
8. Add tests for schema validation, value normalization, and UI-visible behavior.

## Future Extensions

Possible future additions after V1:

- `bridge.openSettings()`
- optional bookmarklet-triggered writes for explicitly declared writable fields
- cross-version migration rules
- import/export of bookmarklet settings

These should only come after the read-only, UI-visible model is working well.
