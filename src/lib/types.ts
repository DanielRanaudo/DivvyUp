export interface Member {
  id: string;
  name: string;
  venmo: string;
  /** Zelle contact — a phone number. */
  zelle: string;
  /** Public URL (backend) or data URL (sandbox) of the profile picture. */
  avatarUrl?: string;
  isTreasurer: boolean;
}

export interface RentConfig {
  id: string;
  amount: number;
  splitType: "equal" | "percentage" | "custom";
  recurring: boolean;
  percentages: Record<string, string>;
  customs: Record<string, string>;
  splits: Record<string, number>;
}

export interface Utility {
  id: string;
  name: string;
  amount: number;
  recurring: boolean;
  splits: Record<string, number>;
  date: string;
  /** One-off bills are archived at close; recurring ones bill again. */
  archived?: boolean;
  period?: string;
}

/**
 * How the treasurer divided an expense: evenly across everyone, evenly across a
 * chosen few, by typed dollar amounts, or by percentage. The amounts in
 * `Expense.splits` are authoritative; this records the intent behind them.
 */
export type SplitMode = "even" | "subset" | "exact" | "percentage";

export interface Expense {
  id: string;
  description: string;
  amount: number;
  submittedBy: string;
  submittedByName: string;
  status: "pending" | "approved" | "denied";
  /**
   * Set when a month is closed: the expense stops counting towards balances
   * (its effect is folded into that month's carry-forward) and is no longer
   * loaded with the group.
   */
  archived?: boolean;
  /** The closed month this belongs to, "YYYY-MM-01". Absent while open. */
  period?: string;
  splits?: Record<string, number>;
  /** Absent on expenses approved before split modes existed (they were even). */
  splitMode?: SplitMode;
  /**
   * Receipt references. In backend mode these are storage object paths, which
   * are exchanged for a short-lived signed URL when one needs displaying; in
   * sandbox mode they are data URLs. Rows written before the receipts bucket
   * became private may still hold a full public URL.
   */
  images?: string[];
  date: string;
}

export interface Payment {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected";
  date: string;
  /** See Expense.archived. Payments nobody has answered yet stay open. */
  archived?: boolean;
  period?: string;
}

export interface SubgroupBill {
  id: string;
  name: string;
  amount: number;
  paidBy: string;
  paidByName: string;
  recurring: boolean;
  splits: Record<string, number>;
  date: string;
  /** One-off bills are archived at close; recurring ones bill again. */
  archived?: boolean;
  period?: string;
}

export interface Subgroup {
  id: string;
  name: string;
  memberIds: string[];
  bills: SubgroupBill[];
}

export interface ChoreCompletion {
  date: string;
  assigneeId: string;
  completedAt: string;
}

export interface Chore {
  id: string;
  name: string;
  icon: string;
  everyDays: number;
  nextDue: string;
  assignMode: "fixed" | "rotation";
  assigneeId: string;
  rotationIds: string[];
  rotationIndex: number;
  history: ChoreCompletion[];
}

/**
 * A month the treasurer has closed. Everything one-off in it was archived, and
 * whatever was still owed at the time is recorded in `carryover` so it keeps
 * counting without the underlying charges having to.
 */
export interface ClosedPeriod {
  id: string;
  /** First day of the month that was closed, "YYYY-MM-01". */
  period: string;
  closedAt: string;
  carryover: Settlement[];
  totals: PeriodTotals;
}

export interface PeriodTotals {
  /** Everything charged to the house that month. */
  spend: number;
  expenses: number;
  payments: number;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  members: Member[];
  rent: RentConfig | null;
  utilities: Utility[];
  expenses: Expense[];
  payments: Payment[];
  subgroups: Subgroup[];
  chores: Chore[];
  /** Closed months, oldest first. Their contents are no longer loaded. */
  periods: ClosedPeriod[];
  smartSettle: boolean;
  /**
   * Version of the subgroups/chores JSON documents. Sent back on write so the
   * server can reject an edit based on a copy someone else has since changed.
   */
  docsVersion: number;
}

export interface Charge {
  id: string;
  type: "rent" | "utility" | "expense" | "subgroup" | "carryover";
  description: string;
  amount: number;
  splits: Record<string, number>;
  recurring: boolean;
  paidBy?: string;
  submittedByName?: string;
  subgroupName?: string;
}

export interface Settlement {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

/** One page of a longer list, plus whether asking again is worthwhile. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
}

export interface Tab {
  id: string;
  label: string;
  badge?: number | null;
}

/** The fields the profile screen can change. */
export interface ProfileEdits {
  venmo: string;
  zelle: string;
  avatarUrl?: string;
  /** Only set when the address is actually being changed. */
  email?: string;
}

export interface ProfileSaveResult {
  error: string | null;
  /** Shown on success, e.g. to say a confirmation email is on its way. */
  notice?: string;
}
