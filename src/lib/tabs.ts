import type { Tab } from "./types";

export interface TabBadges {
  /** Expenses waiting for a treasurer's decision. */
  expenses: number;
  /** Payments waiting for you to confirm you were paid. */
  payments: number;
  /** Chores of yours that are due. */
  chores: number;
}

/**
 * The sections a member can see, and what is waiting in each.
 *
 * Rent and Bills are the treasurer's alone. Hiding them is a courtesy, not a
 * defence — the database is what actually refuses the write.
 */
export function visibleTabs(isTreasurer: boolean, badges: TabBadges): Tab[] {
  const treasurerOnly: Tab[] = [
    { id: "rent", label: "Rent" },
    { id: "utilities", label: "Bills" },
  ];

  return [
    { id: "dashboard", label: "Home", badge: badges.payments || null },
    ...(isTreasurer ? treasurerOnly : []),
    { id: "expenses", label: "Expenses", badge: badges.expenses || null },
    { id: "subgroups", label: "Floors" },
    { id: "chores", label: "Chores", badge: badges.chores || null },
    { id: "settle", label: "Settle" },
    { id: "members", label: "Group" },
  ];
}

/**
 * A link to a treasurer-only tab, or one that no longer exists, lands on the
 * dashboard rather than an empty screen.
 */
export function resolveTab(tabs: Tab[], wanted: string | null): string {
  return tabs.some((t) => t.id === wanted) ? (wanted as string) : "dashboard";
}
