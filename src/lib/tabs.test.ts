import { describe, it, expect } from "vitest";
import { resolveTab, visibleTabs } from "@/lib/tabs";

const none = { expenses: 0, payments: 0, chores: 0 };

describe("visibleTabs", () => {
  it("keeps rent and bills for the treasurer", () => {
    const ids = visibleTabs(true, none).map((t) => t.id);
    expect(ids).toContain("rent");
    expect(ids).toContain("utilities");
  });

  it("hides them from everyone else", () => {
    const ids = visibleTabs(false, none).map((t) => t.id);
    expect(ids).not.toContain("rent");
    expect(ids).not.toContain("utilities");
    expect(ids[0]).toBe("dashboard");
  });

  it("marks the sections with something waiting", () => {
    const tabs = visibleTabs(true, { expenses: 2, payments: 1, chores: 3 });
    const badge = (id: string) => tabs.find((t) => t.id === id)?.badge;

    expect(badge("expenses")).toBe(2);
    expect(badge("dashboard")).toBe(1);
    expect(badge("chores")).toBe(3);
    expect(badge("settle")).toBeUndefined();
  });

  it("leaves a section with nothing waiting unmarked", () => {
    expect(visibleTabs(true, none).find((t) => t.id === "chores")?.badge).toBe(
      null
    );
  });
});

describe("resolveTab", () => {
  const tabs = visibleTabs(false, none);

  it("keeps a tab this member can see", () => {
    expect(resolveTab(tabs, "settle")).toBe("settle");
  });

  it("sends a link to a treasurer-only tab home", () => {
    expect(resolveTab(tabs, "rent")).toBe("dashboard");
  });

  it("sends a link to nothing home", () => {
    expect(resolveTab(tabs, null)).toBe("dashboard");
    expect(resolveTab(tabs, "nonsense")).toBe("dashboard");
  });
});
