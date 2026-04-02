import { describe, expect, test } from "vitest";
import { sanitizeHeaders } from "../../../src/background/actions/network";

describe("sanitizeHeaders", () => {
  test("removes forbidden headers case-insensitively", () => {
    expect(
      sanitizeHeaders({
        Host: "example.com",
        "Content-Length": "123",
        Origin: "https://example.com",
        Referer: "https://example.com/page",
        Cookie: "session=abc",
        "Set-Cookie": "session=abc",
        Accept: "application/json",
        "X-Custom": "kept"
      })
    ).toEqual({
      Accept: "application/json",
      "X-Custom": "kept"
    });
  });

  test("returns an empty object when headers are undefined", () => {
    expect(sanitizeHeaders(undefined)).toEqual({});
  });
});
