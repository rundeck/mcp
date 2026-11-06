/**
 * Tests for extra-header validation
 */

import { mergeExtraHeaders, validateExtraHeaders, MAX_EXTRA_HEADERS } from "../../utils/headers.js";

describe("validateExtraHeaders", () => {
  it("accepts a plain header map", () => {
    const result = validateExtraHeaders(
      { "CF-Access-Client-Id": "abc.access", "CF-Access-Client-Secret": "s3cr3t value" },
      "test"
    );
    expect(result).toEqual({
      ok: true,
      headers: { "CF-Access-Client-Id": "abc.access", "CF-Access-Client-Secret": "s3cr3t value" },
    });
  });

  it.each([null, [], "x", 42])("rejects non-object input %p", (input) => {
    expect(validateExtraHeaders(input, "test").ok).toBe(false);
  });

  it.each(["Bad Name", "Bad:Name", "Bad\r\nName", "", "näme"])("rejects invalid name %p", (name) => {
    expect(validateExtraHeaders({ [name]: "v" }, "test").ok).toBe(false);
  });

  it.each(["a\r\nInjected: 1", "a\nb", "a\rb", "a\0b", "a\x7fb", "ünï", ""])(
    "rejects invalid value %p",
    (value) => {
      expect(validateExtraHeaders({ "X-Ok": value }, "test").ok).toBe(false);
    }
  );

  it("rejects non-string values", () => {
    expect(validateExtraHeaders({ "X-Ok": 1 }, "test").ok).toBe(false);
    expect(validateExtraHeaders({ "X-Ok": null }, "test").ok).toBe(false);
    expect(validateExtraHeaders({ "X-Ok": { a: 1 } }, "test").ok).toBe(false);
  });

  it.each([
    "X-Rundeck-Auth-Token",
    "x-rundeck-auth-token",
    "Content-Type",
    "Accept",
    "User-Agent",
    "Host",
    "Content-Length",
    "Transfer-Encoding",
    "Connection",
    "Proxy-Authorization",
    "Upgrade",
    "TE",
  ])("rejects reserved header %s", (name) => {
    const result = validateExtraHeaders({ [name]: "v" }, "test");
    expect(result.ok).toBe(false);
  });

  it("rejects prototype-polluting names without polluting Object.prototype", () => {
    const input = JSON.parse('{"__proto__":"x"}');
    expect(validateExtraHeaders(input, "test").ok).toBe(false);
    expect(validateExtraHeaders({ constructor: "x" }, "test").ok).toBe(false);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("rejects names that differ only by case", () => {
    expect(validateExtraHeaders({ "X-A": "1", "x-a": "2" }, "test").ok).toBe(false);
  });

  it("rejects too many headers and oversized values", () => {
    const many = Object.fromEntries(Array.from({ length: MAX_EXTRA_HEADERS + 1 }, (_, i) => [`X-H${i}`, "v"]));
    expect(validateExtraHeaders(many, "test").ok).toBe(false);
    expect(validateExtraHeaders({ "X-Big": "a".repeat(5000) }, "test").ok).toBe(false);
  });

  it("never includes header values in error messages", () => {
    const result = validateExtraHeaders({ "X-Secret": "super-secret\r\nvalue" }, "test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("super-secret");
    }
  });

  it("escapes control characters in names it echoes", () => {
    const result = validateExtraHeaders({ "Bad\r\nName": "v" }, "test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/[\r\n]/);
    }
  });
});

describe("mergeExtraHeaders", () => {
  it("lets the override win case-insensitively without duplicating the name", () => {
    const merged = mergeExtraHeaders({ "CF-Access-Client-Id": "global", "X-A": "1" }, { "cf-access-client-id": "inst" });
    expect({ ...merged }).toEqual({ "cf-access-client-id": "inst", "X-A": "1" });
  });
});
