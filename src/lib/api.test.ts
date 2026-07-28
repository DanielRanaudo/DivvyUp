import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGroupOps, persistGroupDiff } from "@/lib/api";
import { evenSplit } from "@/lib/splits";
import type { Expense, Group, Member, Payment } from "@/lib/types";

// ---------------------------------------------------------------------------
// A fake Supabase client that records what it was asked to do instead of
// talking to a server. Query builders are thenables, so awaiting one resolves
// to whatever result the test queued up.
// ---------------------------------------------------------------------------

interface Recorded {
  kind: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  table?: string;
  fn?: string;
  payload?: unknown;
  filters: Record<string, unknown>;
}

interface FakeResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

function fakeSupabase(results: Record<string, FakeResult> = {}) {
  const calls: Recorded[] = [];

  const resultFor = (key: string): FakeResult =>
    results[key] ?? { data: [{ id: "row" }], error: null };

  const builder = (record: Recorded, key: string) => {
    const chain = {
      eq(column: string, value: unknown) {
        record.filters[column] = value;
        return chain;
      },
      select() {
        return chain;
      },
      then<T>(
        onFulfilled: (value: {
          data?: unknown;
          error: { message: string; code?: string } | null;
        }) => T
      ) {
        const r = resultFor(key);
        return Promise.resolve(
          onFulfilled({ data: r.data, error: r.error ?? null })
        );
      },
    };
    return chain;
  };

  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          const record: Recorded = {
            kind: "insert",
            table,
            payload,
            filters: {},
          };
          calls.push(record);
          return builder(record, `${table}.insert`);
        },
        update(payload: unknown) {
          const record: Recorded = {
            kind: "update",
            table,
            payload,
            filters: {},
          };
          calls.push(record);
          return builder(record, `${table}.update`);
        },
        upsert(payload: unknown) {
          const record: Recorded = {
            kind: "upsert",
            table,
            payload,
            filters: {},
          };
          calls.push(record);
          return builder(record, `${table}.upsert`);
        },
        delete() {
          const record: Recorded = { kind: "delete", table, filters: {} };
          calls.push(record);
          return builder(record, `${table}.delete`);
        },
      };
    },
    rpc(fn: string, payload: unknown) {
      const record: Recorded = { kind: "rpc", fn, payload, filters: {} };
      calls.push(record);
      return builder(record, `rpc.${fn}`);
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALEX = "11111111-1111-4111-8111-111111111111";
const BEA = "22222222-2222-4222-8222-222222222222";

function member(id: string, name: string, isTreasurer = false): Member {
  return { id, name, venmo: "", zelle: "", isTreasurer };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Apt 4B",
    code: "ABC1234567",
    members: [member(ALEX, "Alex", true), member(BEA, "Bea")],
    rent: null,
    utilities: [],
    expenses: [],
    payments: [],
    subgroups: [],
    chores: [],
    periods: [],
    smartSettle: false,
    docsVersion: 3,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    description: "Soap",
    amount: 30,
    submittedBy: BEA,
    submittedByName: "Bea",
    status: "pending",
    date: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    fromId: BEA,
    fromName: "Bea",
    toId: ALEX,
    toName: "Alex",
    amount: 15,
    status: "pending",
    date: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function opsFor(prev: Group, next: Group) {
  const { client, calls } = fakeSupabase();
  const ops = buildGroupOps(client, prev, next);
  return { ops, calls, labels: ops.map((o) => o.label) };
}

// ---------------------------------------------------------------------------

describe("buildGroupOps", () => {
  it("writes nothing when nothing changed", () => {
    const g = group();
    const { ops } = opsFor(g, { ...g });
    expect(ops).toHaveLength(0);
  });

  it("updates the group row when a treasurer-only scalar changes", () => {
    const prev = group();
    const { calls } = opsFor(prev, { ...prev, smartSettle: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "update",
      table: "groups",
      payload: { name: "Apt 4B", smart_settle: true },
      filters: { id: "group-1" },
    });
  });

  describe("chores and floors", () => {
    it("goes through the RPC and sends the version it read", () => {
      const prev = group();
      const next = {
        ...prev,
        subgroups: [
          { id: "s1", name: "Upstairs", memberIds: [ALEX], bills: [] },
        ],
      };
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "update_group_docs",
        payload: { p_group_id: "group-1", p_version: 3 },
      });
    });

    it("reports the new version so the next edit isn't stale", async () => {
      const prev = group();
      const next = { ...prev, chores: [] as Group["chores"] };
      next.subgroups = [{ id: "s1", name: "Up", memberIds: [], bills: [] }];

      const { client } = fakeSupabase({
        "rpc.update_group_docs": { data: 4, error: null },
      });
      let seen: number | undefined;
      const ops = buildGroupOps(client, prev, next, (v) => {
        seen = v;
      });
      await ops[0].run;
      ops[0].onSuccess?.(4);

      expect(seen).toBe(4);
    });
  });

  describe("expenses", () => {
    it("submits as pending with no splits, whatever the caller passed", () => {
      const prev = group();
      // A tampered client trying to insert a pre-approved expense.
      const next = {
        ...prev,
        expenses: [
          expense({
            status: "approved",
            splits: { [BEA]: 0, [ALEX]: 30 },
          }),
        ],
      };
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      const payload = (calls[0].payload as Record<string, unknown>[])[0];
      expect(payload.status).toBe("pending");
      expect(payload.splits).toBeNull();
    });

    it("approves through the RPC, carrying the splits", () => {
      const pending = expense();
      const prev = group({ expenses: [pending] });
      const splits = evenSplit(30, [ALEX, BEA]);
      const next = group({
        expenses: [{ ...pending, status: "approved", splits }],
      });
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "approve_expense",
        payload: { p_expense_id: "expense-1", p_splits: splits, p_mode: "even" },
      });
    });

    it("carries the split mode the treasurer chose", () => {
      const pending = expense();
      const prev = group({ expenses: [pending] });
      const splits = { [ALEX]: 30 };
      const next = group({
        expenses: [
          { ...pending, status: "approved", splits, splitMode: "subset" as const },
        ],
      });
      const { calls } = opsFor(prev, next);

      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "approve_expense",
        payload: { p_splits: splits, p_mode: "subset" },
      });
    });

    it("denies through the RPC", () => {
      const prev = group({ expenses: [expense()] });
      const next = group({ expenses: [expense({ status: "denied" })] });
      const { calls } = opsFor(prev, next);

      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "deny_expense",
        payload: { p_expense_id: "expense-1" },
      });
    });

    it("reopens through the RPC when an approval is undone", () => {
      const approved = expense({
        status: "approved",
        splits: evenSplit(30, [ALEX, BEA]),
      });
      const prev = group({ expenses: [approved] });
      const next = group({
        expenses: [{ ...approved, status: "pending", splits: undefined }],
      });
      const { calls } = opsFor(prev, next);

      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "reopen_expense",
      });
    });

    it("edits through the RPC when the status is unchanged", () => {
      const prev = group({ expenses: [expense()] });
      const next = group({
        expenses: [expense({ description: "Dish soap", amount: 32 })],
      });
      const { calls } = opsFor(prev, next);

      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "update_expense",
        payload: {
          p_expense_id: "expense-1",
          p_description: "Dish soap",
          p_amount: 32,
        },
      });
    });

    it("never sends a plain UPDATE to the expenses table", () => {
      const prev = group({ expenses: [expense()] });
      const next = group({
        expenses: [expense({ status: "approved", splits: { [ALEX]: 30 } })],
      });
      const { calls } = opsFor(prev, next);

      expect(
        calls.some((c) => c.table === "expenses" && c.kind === "update")
      ).toBe(false);
    });

    it("deletes a removed expense", () => {
      const prev = group({ expenses: [expense()] });
      const { calls } = opsFor(prev, group());

      expect(calls[0]).toMatchObject({
        kind: "delete",
        table: "expenses",
        filters: { id: "expense-1" },
      });
    });
  });

  describe("payments", () => {
    it("records a payment as pending", () => {
      const next = group({ payments: [payment({ status: "confirmed" })] });
      const { calls } = opsFor(group(), next);

      const payload = (calls[0].payload as Record<string, unknown>[])[0];
      expect(payload.status).toBe("pending");
    });

    it("confirms through the RPC rather than a table update", () => {
      const prev = group({ payments: [payment()] });
      const next = group({ payments: [payment({ status: "confirmed" })] });
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "confirm_payment",
        payload: { p_payment_id: "payment-1", p_status: "confirmed" },
      });
    });

    it("ignores changes to fields that aren't the status", () => {
      const prev = group({ payments: [payment()] });
      // An attempt to inflate the amount while confirming.
      const next = group({ payments: [payment({ amount: 999 })] });
      const { ops } = opsFor(prev, next);

      expect(ops).toHaveLength(0);
    });
  });

  describe("members", () => {
    it("promotes via transfer_treasurer instead of writing the column", () => {
      const prev = group();
      const next = group({
        members: [member(ALEX, "Alex"), member(BEA, "Bea", true)],
      });
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        kind: "rpc",
        fn: "transfer_treasurer",
        payload: { p_group_id: "group-1", p_member_id: BEA },
      });
    });

    it("never sends is_treasurer in a member update", () => {
      const prev = group();
      const next = group({
        members: [
          member(ALEX, "Alex", true),
          { ...member(BEA, "Bea"), venmo: "@bea" },
        ],
      });
      const { calls } = opsFor(prev, next);

      expect(calls).toHaveLength(1);
      expect(calls[0].payload).not.toHaveProperty("is_treasurer");
      expect(calls[0].payload).toMatchObject({ venmo: "@bea" });
    });

    it("deletes a removed member", () => {
      const next = group({ members: [member(ALEX, "Alex", true)] });
      const { calls } = opsFor(group(), next);

      expect(calls[0]).toMatchObject({
        kind: "delete",
        table: "group_members",
        filters: { id: BEA },
      });
    });
  });

  describe("rent and bills", () => {
    it("upserts rent on the group_id conflict target", () => {
      const next = group({
        rent: {
          id: "rent",
          amount: 3000,
          splitType: "equal",
          recurring: true,
          percentages: {},
          customs: {},
          splits: evenSplit(3000, [ALEX, BEA]),
        },
      });
      const { calls } = opsFor(group(), next);

      expect(calls[0]).toMatchObject({
        kind: "upsert",
        table: "rent",
        payload: { group_id: "group-1", amount: 3000 },
      });
    });

    it("deletes rent when it is cleared", () => {
      const prev = group({
        rent: {
          id: "rent",
          amount: 3000,
          splitType: "equal",
          recurring: true,
          percentages: {},
          customs: {},
          splits: {},
        },
      });
      const { calls } = opsFor(prev, group());

      expect(calls[0]).toMatchObject({ kind: "delete", table: "rent" });
    });

    it("batches changed bills into one upsert", () => {
      const prev = group({
        utilities: [
          {
            id: "u1",
            name: "Power",
            amount: 90,
            recurring: true,
            splits: {},
            date: "2026-07-01T00:00:00.000Z",
          },
        ],
      });
      const next = group({
        utilities: [
          { ...prev.utilities[0], amount: 95 },
          {
            id: "u2",
            name: "Internet",
            amount: 60,
            recurring: true,
            splits: {},
            date: "2026-07-01T00:00:00.000Z",
          },
        ],
      });
      const { ops, calls } = opsFor(prev, next);

      expect(ops).toHaveLength(1);
      expect((calls[0].payload as unknown[]).length).toBe(2);
      expect(ops[0].expectRows).toBe(2);
    });
  });
});

describe("persistGroupDiff", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports no errors when every write succeeds", async () => {
    const { client } = fakeSupabase();
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      smartSettle: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.conflict).toBeUndefined();
  });

  it("surfaces the error message from a failed write", async () => {
    const { client } = fakeSupabase({
      "groups.update": {
        error: { message: "new row violates row-level security policy" },
      },
    });
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      smartSettle: true,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Group settings");
    expect(result.errors[0]).toContain("row-level security");
  });

  it("treats a zero-row update as a permission problem", async () => {
    // This is what an RLS-blocked UPDATE looks like: no error, no rows.
    const { client } = fakeSupabase({
      "groups.update": { data: [], error: null },
    });
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      name: "Renamed",
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("don't have permission");
  });

  it("accepts an update that affected the expected number of rows", async () => {
    const { client } = fakeSupabase({
      "groups.update": { data: [{ id: "group-1" }], error: null },
    });
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      name: "Renamed",
    });

    expect(result.errors).toEqual([]);
  });

  it("flags a lost edit race so the caller can reload", async () => {
    const { client } = fakeSupabase({
      "rpc.update_group_docs": {
        error: { message: "Someone else changed the chores", code: "40001" },
      },
    });
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      subgroups: [{ id: "s1", name: "Up", memberIds: [], bills: [] }],
    });

    expect(result.conflict).toBe(true);
    expect(result.errors).toHaveLength(1);
  });

  it("passes the new document version back to the caller", async () => {
    const { client } = fakeSupabase({
      "rpc.update_group_docs": { data: 4, error: null },
    });
    const prev = group();
    const result = await persistGroupDiff(client, prev, {
      ...prev,
      subgroups: [{ id: "s1", name: "Up", memberIds: [], bills: [] }],
    });

    expect(result.docsVersion).toBe(4);
  });

  it("runs batches for one group in the order they were queued", async () => {
    // Two quick edits must not be able to land out of order, or the database
    // ends up holding the earlier value while the UI shows the later one.
    const order: string[] = [];
    const client = {
      from() {
        return {
          update(payload: { name: string }) {
            const chain = {
              eq: () => chain,
              select: () => chain,
              then<T>(onFulfilled: (v: { error: null }) => T) {
                order.push(payload.name);
                return Promise.resolve(onFulfilled({ error: null }));
              },
            };
            return chain;
          },
        };
      },
      rpc() {
        throw new Error("not expected");
      },
    } as unknown as SupabaseClient;

    const base = group();
    const first = { ...base, name: "first" };
    const second = { ...first, name: "second" };

    const a = persistGroupDiff(client, base, first);
    const b = persistGroupDiff(client, first, second);
    await Promise.all([a, b]);

    expect(order).toEqual(["first", "second"]);
  });

  it("keeps the queue moving after a batch throws", async () => {
    let calls = 0;
    const client = {
      from() {
        return {
          update() {
            calls += 1;
            const attempt = calls;
            const chain = {
              eq: () => chain,
              select: () => chain,
              then<T>(
                onFulfilled: (v: { data: unknown; error: null }) => T,
                onRejected?: (e: unknown) => T
              ) {
                if (attempt === 1) {
                  return Promise.resolve(
                    onRejected
                      ? onRejected(new Error("network down"))
                      : ({} as T)
                  );
                }
                return Promise.resolve(
                  onFulfilled({ data: [{ id: "group-1" }], error: null })
                );
              },
            };
            return chain;
          },
        };
      },
      rpc() {
        throw new Error("not expected");
      },
    } as unknown as SupabaseClient;

    const base = group();
    const first = { ...base, name: "first" };
    const second = { ...first, name: "second" };

    const a = await persistGroupDiff(client, base, first);
    const b = await persistGroupDiff(client, first, second);

    expect(a.errors).toHaveLength(1);
    expect(b.errors).toEqual([]);
  });
});
