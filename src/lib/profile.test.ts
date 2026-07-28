import { describe, it, expect } from "vitest";
import {
  zelleDigits,
  formatZelle,
  isValidZelle,
  isValidEmail,
  normalizeVenmo,
  payContactLine,
} from "./profile";

describe("zelleDigits", () => {
  it("keeps only digits", () => {
    expect(zelleDigits("(555) 123-4567")).toBe("5551234567");
    expect(zelleDigits("+1 555.123.4567")).toBe("15551234567");
  });

  it("returns an empty string when there are no digits", () => {
    expect(zelleDigits("")).toBe("");
    expect(zelleDigits("not a phone")).toBe("");
  });
});

describe("formatZelle", () => {
  it("formats a 10-digit number", () => {
    expect(formatZelle("5551234567")).toBe("(555) 123-4567");
    expect(formatZelle("555 123 4567")).toBe("(555) 123-4567");
  });

  it("formats an 11-digit number with a country code", () => {
    expect(formatZelle("15551234567")).toBe("+1 (555) 123-4567");
  });

  it("leaves unrecognised input trimmed", () => {
    expect(formatZelle("  12345  ")).toBe("12345");
    expect(formatZelle("")).toBe("");
  });
});

describe("isValidZelle", () => {
  it("treats empty as valid because the field is optional", () => {
    expect(isValidZelle("")).toBe(true);
    expect(isValidZelle("   ")).toBe(true);
  });

  it("accepts 10-digit and 1-prefixed 11-digit numbers", () => {
    expect(isValidZelle("(555) 123-4567")).toBe(true);
    expect(isValidZelle("+1 555 123 4567")).toBe(true);
  });

  it("rejects numbers of the wrong length", () => {
    expect(isValidZelle("555123")).toBe(false);
    expect(isValidZelle("25551234567")).toBe(false);
    expect(isValidZelle("555123456789")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("someone@example.com")).toBe(true);
    expect(isValidEmail("  someone@example.co.uk ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("someone")).toBe(false);
    expect(isValidEmail("someone@")).toBe(false);
    expect(isValidEmail("someone@example")).toBe(false);
    expect(isValidEmail("a b@example.com")).toBe(false);
  });
});

describe("payContactLine", () => {
  it("joins both methods when both are set", () => {
    expect(payContactLine({ venmo: "@dan", zelle: "(555) 123-4567" })).toBe(
      "@dan · (555) 123-4567"
    );
  });

  it("shows just the one that is set", () => {
    expect(payContactLine({ venmo: "@dan", zelle: "" })).toBe("@dan");
    expect(payContactLine({ venmo: "", zelle: "(555) 123-4567" })).toBe(
      "(555) 123-4567"
    );
  });

  it("is empty when neither is set or the member is missing", () => {
    expect(payContactLine({ venmo: "", zelle: "" })).toBe("");
    expect(payContactLine(undefined)).toBe("");
    expect(payContactLine(null)).toBe("");
  });
});

describe("normalizeVenmo", () => {
  it("adds a leading @ when missing", () => {
    expect(normalizeVenmo("danielv")).toBe("@danielv");
  });

  it("leaves an existing @ alone", () => {
    expect(normalizeVenmo("@danielv")).toBe("@danielv");
  });

  it("keeps empty input empty rather than returning a bare @", () => {
    expect(normalizeVenmo("")).toBe("");
    expect(normalizeVenmo("   ")).toBe("");
  });
});
