import {
  MAX_BOOKMARKLET_SETTING_DESCRIPTION_LENGTH,
  MAX_BOOKMARKLET_SETTING_LABEL_LENGTH,
  MAX_BOOKMARKLET_SETTING_OPTION_LENGTH,
  MAX_BOOKMARKLET_SETTING_OPTIONS,
  MAX_BOOKMARKLET_SETTING_TEXT_DEFAULT_LENGTH,
  MAX_BOOKMARKLET_SETTINGS
} from "./constants";
import { BridgeError, ensureNever } from "./errors";
import type {
  BookmarkletSettingDefinition,
  BookmarkletSettingScalarValue,
  BookmarkletSettingsSchema,
  BookmarkletSettingsValues
} from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError("invalid_request", `${field} must be a non-empty string.`);
  }
  return value;
}

function requireStringValue(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new BridgeError("invalid_request", `${field} must be a string.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeError("invalid_request", `${field} must be a finite number.`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BridgeError("invalid_request", `${field} must be a boolean.`);
  }
  return value;
}

function validateSharedMetadata(fieldPath: string, value: Record<string, unknown>): void {
  const label = requireString(value.label, `${fieldPath}.label`);
  if (label.length > MAX_BOOKMARKLET_SETTING_LABEL_LENGTH) {
    throw new BridgeError("invalid_request", `${fieldPath}.label is too long.`);
  }

  const description = requireString(value.description, `${fieldPath}.description`);
  if (description.length > MAX_BOOKMARKLET_SETTING_DESCRIPTION_LENGTH) {
    throw new BridgeError("invalid_request", `${fieldPath}.description is too long.`);
  }
}

function parseOptionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireFiniteNumber(value, field);
}

function parseOptionalPositiveNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = requireFiniteNumber(value, field);
  if (parsed <= 0) {
    throw new BridgeError("invalid_request", `${field} must be greater than 0.`);
  }
  return parsed;
}

function validateNumericBounds(
  fieldPath: string,
  minimum: number | undefined,
  maximum: number | undefined
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new BridgeError("invalid_request", `${fieldPath}.min must be less than or equal to ${fieldPath}.max.`);
  }
}

function validateNumericDefault(
  fieldPath: string,
  type: "integer" | "float",
  defaultValue: number,
  minimum: number | undefined,
  maximum: number | undefined
): void {
  if (type === "integer" && !Number.isInteger(defaultValue)) {
    throw new BridgeError("invalid_request", `${fieldPath}.default must be an integer.`);
  }
  if (minimum !== undefined && defaultValue < minimum) {
    throw new BridgeError("invalid_request", `${fieldPath}.default must be greater than or equal to ${fieldPath}.min.`);
  }
  if (maximum !== undefined && defaultValue > maximum) {
    throw new BridgeError("invalid_request", `${fieldPath}.default must be less than or equal to ${fieldPath}.max.`);
  }
}

function parseSettingDefinition(key: string, value: unknown): BookmarkletSettingDefinition {
  const fieldPath = `bookmarklet.settings.${key}`;
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", `${fieldPath} must be a plain object.`);
  }

  validateSharedMetadata(fieldPath, value);

  const type = requireString(value.type, `${fieldPath}.type`);
  switch (type) {
    case "boolean":
      return {
        type,
        label: value.label as string,
        description: value.description as string,
        default: requireBoolean(value.default, `${fieldPath}.default`)
      };
    case "text": {
      const defaultValue = requireStringValue(value.default, `${fieldPath}.default`);
      if (defaultValue.length > MAX_BOOKMARKLET_SETTING_TEXT_DEFAULT_LENGTH) {
        throw new BridgeError("invalid_request", `${fieldPath}.default is too long.`);
      }
      const maxLength = parseOptionalPositiveNumber(value.maxLength, `${fieldPath}.maxLength`);
      if (maxLength !== undefined && defaultValue.length > maxLength) {
        throw new BridgeError("invalid_request", `${fieldPath}.default exceeds ${fieldPath}.maxLength.`);
      }
      const placeholder = value.placeholder;
      if (placeholder !== undefined && typeof placeholder !== "string") {
        throw new BridgeError("invalid_request", `${fieldPath}.placeholder must be a string.`);
      }
      const multiline = value.multiline;
      if (multiline !== undefined && typeof multiline !== "boolean") {
        throw new BridgeError("invalid_request", `${fieldPath}.multiline must be a boolean.`);
      }
      return {
        type,
        label: value.label as string,
        description: value.description as string,
        default: defaultValue,
        placeholder: placeholder as string | undefined,
        multiline: multiline as boolean | undefined,
        maxLength
      };
    }
    case "integer":
    case "float": {
      const defaultValue = requireFiniteNumber(value.default, `${fieldPath}.default`);
      const min = parseOptionalFiniteNumber(value.min, `${fieldPath}.min`);
      const max = parseOptionalFiniteNumber(value.max, `${fieldPath}.max`);
      const step = parseOptionalPositiveNumber(value.step, `${fieldPath}.step`);
      validateNumericBounds(fieldPath, min, max);
      validateNumericDefault(fieldPath, type, defaultValue, min, max);
      return {
        type,
        label: value.label as string,
        description: value.description as string,
        default: defaultValue,
        min,
        max,
        step
      };
    }
    case "option": {
      const optionsValue = value.options;
      if (!Array.isArray(optionsValue)) {
        throw new BridgeError("invalid_request", `${fieldPath}.options must be an array.`);
      }
      if (optionsValue.length === 0) {
        throw new BridgeError("invalid_request", `${fieldPath}.options must not be empty.`);
      }
      if (optionsValue.length > MAX_BOOKMARKLET_SETTING_OPTIONS) {
        throw new BridgeError("invalid_request", `${fieldPath}.options has too many entries.`);
      }
      const options = optionsValue.map((option, index) => {
        const normalized = requireString(option, `${fieldPath}.options[${index}]`);
        if (normalized.length > MAX_BOOKMARKLET_SETTING_OPTION_LENGTH) {
          throw new BridgeError("invalid_request", `${fieldPath}.options[${index}] is too long.`);
        }
        return normalized;
      });
      const defaultValue = requireString(value.default, `${fieldPath}.default`);
      if (!options.includes(defaultValue)) {
        throw new BridgeError("invalid_request", `${fieldPath}.default must be one of ${fieldPath}.options.`);
      }
      return {
        type,
        label: value.label as string,
        description: value.description as string,
        default: defaultValue,
        options
      };
    }
    default:
      throw new BridgeError("invalid_request", `${fieldPath}.type is unsupported.`);
  }
}

export function parseBookmarkletSettingsSchema(value: unknown): BookmarkletSettingsSchema | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new BridgeError("invalid_request", "bookmarklet.settings must be a plain object.");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_BOOKMARKLET_SETTINGS) {
    throw new BridgeError("invalid_request", "bookmarklet.settings has too many fields.");
  }

  const schema: BookmarkletSettingsSchema = {};
  for (const [key, definition] of entries) {
    if (!key.trim()) {
      throw new BridgeError("invalid_request", "bookmarklet.settings keys must be non-empty strings.");
    }
    schema[key] = parseSettingDefinition(key, definition);
  }
  return schema;
}

function isValidScalarValue(
  definition: BookmarkletSettingDefinition,
  value: BookmarkletSettingScalarValue | undefined
): value is BookmarkletSettingScalarValue {
  switch (definition.type) {
    case "boolean":
      return typeof value === "boolean";
    case "text":
      return (
        typeof value === "string" &&
        (definition.maxLength === undefined || value.length <= definition.maxLength)
      );
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value) &&
        (definition.min === undefined || value >= definition.min) &&
        (definition.max === undefined || value <= definition.max)
      );
    case "float":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (definition.min === undefined || value >= definition.min) &&
        (definition.max === undefined || value <= definition.max)
      );
    case "option":
      return typeof value === "string" && definition.options.includes(value);
    default:
      ensureNever(definition);
  }
}

export function getBookmarkletSettingsDefaults(schema: BookmarkletSettingsSchema): BookmarkletSettingsValues {
  return Object.fromEntries(
    Object.entries(schema).map(([key, definition]) => [key, definition.default])
  );
}

export function normalizeBookmarkletSettingsValues(
  schema: BookmarkletSettingsSchema,
  values: unknown
): BookmarkletSettingsValues {
  const source = isPlainObject(values) ? values : {};
  const normalized: BookmarkletSettingsValues = {};

  for (const [key, definition] of Object.entries(schema)) {
    const candidate = source[key];
    normalized[key] = isValidScalarValue(definition, candidate as BookmarkletSettingScalarValue | undefined)
      ? (candidate as BookmarkletSettingScalarValue)
      : definition.default;
  }

  return normalized;
}
