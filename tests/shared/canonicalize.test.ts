import { describe, expect, test } from "vitest";
import { canonicalizeJson, canonicalizeRecord } from "../../src/shared/canonicalize";

describe("canonicalizeJson", () => {
  test("sorts object keys recursively to produce a stable string", () => {
    const first = canonicalizeJson({
      zebra: 1,
      alpha: {
        delta: true,
        beta: [3, { y: "second", x: "first" }]
      }
    });

    const second = canonicalizeJson({
      alpha: {
        beta: [3, { x: "first", y: "second" }],
        delta: true
      },
      zebra: 1
    });

    expect(first).toBe(second);
    expect(first).toBe('{"alpha":{"beta":[3,{"x":"first","y":"second"}],"delta":true},"zebra":1}');
  });

  test("preserves array order while canonicalizing nested objects", () => {
    expect(
      canonicalizeJson([
        { b: 2, a: 1 },
        { d: 4, c: 3 }
      ])
    ).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
  });
});

describe("canonicalizeRecord", () => {
  test("matches canonicalizeJson for plain records", () => {
    const value = { b: "two", a: { d: "four", c: "three" } };

    expect(canonicalizeRecord(value)).toBe(canonicalizeJson(value));
  });
});
