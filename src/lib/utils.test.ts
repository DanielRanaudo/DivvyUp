import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  groupCode,
  normalizeInviteCode,
  withTimeout,
} from "./utils";

describe("groupCode", () => {
  it("matches the length and alphabet the database issues", () => {
    const pattern = new RegExp(
      `^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`
    );
    for (let i = 0; i < 200; i++) {
      expect(groupCode()).toMatch(pattern);
    }
  });
});

describe("normalizeInviteCode", () => {
  it("upper-cases what was typed in lower case", () => {
    expect(normalizeInviteCode("a1b2c3d4e5")).toBe("A1B2C3D4E5");
  });

  it("keeps a full-length code intact", () => {
    const code = groupCode();
    expect(normalizeInviteCode(code)).toBe(code);
  });

  it("drops spaces and separators from a pasted code", () => {
    expect(normalizeInviteCode(" A1B2 C3-D4E5 ")).toBe("A1B2C3D4E5");
  });

  it("folds the letters Crockford base32 reads as digits", () => {
    expect(normalizeInviteCode("ILO")).toBe("110");
  });

  it("drops the letters Crockford base32 has no place for", () => {
    expect(normalizeInviteCode("A1U2")).toBe("A12");
  });

  it("truncates anything longer than a code", () => {
    expect(normalizeInviteCode("A1B2C3D4E5F6G7")).toBe("A1B2C3D4E5");
  });
});

describe("withTimeout", () => {
  it("passes through a value that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 50, "too slow")).resolves.toBe(
      7
    );
  });

  it("passes through the original rejection", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("no route to host")), 50, "too slow")
    ).rejects.toThrow("no route to host");
  });

  it("rejects with the given message when the promise never settles", async () => {
    await expect(
      withTimeout(new Promise(() => {}), 10, "too slow")
    ).rejects.toThrow("too slow");
  });

  it("does not reject a promise that settles just before the deadline", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("ok"), 10));
    await expect(withTimeout(slow, 500, "too slow")).resolves.toBe("ok");
  });
});
