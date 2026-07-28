import { describe, it, expect } from "vitest";
import { roster } from "@/lib/roster";
import type { Member } from "@/lib/types";

const members: Member[] = [
  { id: "a", name: "Alex", venmo: "", zelle: "", isTreasurer: true },
  { id: "b", name: "Bea", venmo: "", zelle: "", isTreasurer: false },
];

describe("roster", () => {
  it("finds a member and where they sit in the list", () => {
    const r = roster(members);

    expect(r.byId("b")?.name).toBe("Bea");
    expect(r.indexOf("b")).toBe(1);
  });

  it("does not mistake a missing id for the first member", () => {
    const r = roster(members);

    expect(r.byId("gone")).toBeUndefined();
    expect(r.byId(undefined)).toBeUndefined();
    expect(r.indexOf("gone")).toBe(-1);
  });

  it("names someone who has left rather than showing an id", () => {
    expect(roster(members).nameOf("gone")).toBe("Former roommate");
  });
});
