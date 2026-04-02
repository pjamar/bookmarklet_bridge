import type { JsonValue } from "./types";

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonValue>>((accumulator, key) => {
        accumulator[key] = sortValue((value as Record<string, JsonValue>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function canonicalizeJson(value: JsonValue): string {
  return JSON.stringify(sortValue(value));
}

export function canonicalizeRecord(value: Record<string, unknown>): string {
  return canonicalizeJson(value as JsonValue);
}
