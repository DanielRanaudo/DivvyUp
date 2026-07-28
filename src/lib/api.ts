import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/observability";
import type {
  Group,
  Member,
  RentConfig,
  Utility,
  Expense,
  Payment,
  Subgroup,
  Chore,
  ClosedPeriod,
  PeriodTotals,
  Settlement,
  Page,
} from "@/lib/types";

export interface LoadedGroup {
  group: Group;
  myMemberId: string;
}

const GROUP_SELECT = `
  id, name, code, smart_settle, subgroups, chores, docs_version, created_by,
  group_members ( id, user_id, name, venmo, zelle, avatar_url, is_treasurer ),
  rent ( amount, split_type, recurring, percentages, customs, splits ),
  utilities ( id, name, amount, recurring, splits, date, archived, period ),
  expenses ( id, submitted_by, submitted_by_name, description, amount, status, splits, split_mode, images, date, archived, period ),
  payments ( id, from_id, from_name, to_id, to_name, amount, status, date, archived, period ),
  group_periods ( id, period, closed_at, carryover, totals )
`;

/**
 * A group with only what is still open on it.
 *
 * Closed months are history: their rows still exist, but leaving them out is
 * the point of closing — a house that has been running for two years should not
 * send two years of receipts down the wire to show this month's balance. The
 * archive is read a month at a time instead.
 */
function selectGroups(supabase: SupabaseClient) {
  return supabase
    .from("groups")
    .select(GROUP_SELECT)
    .eq("expenses.archived", false)
    .eq("payments.archived", false)
    .eq("utilities.archived", false);
}

// ---------------------------------------------------------------------------
// Row -> app-type mapping
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapMember(r: any): Member {
  return {
    id: r.id,
    name: r.name,
    venmo: r.venmo ?? "",
    zelle: r.zelle ?? "",
    avatarUrl: r.avatar_url ?? undefined,
    isTreasurer: !!r.is_treasurer,
  };
}

function mapRent(r: any): RentConfig | null {
  if (!r) return null;
  return {
    id: r.id ?? "rent",
    amount: Number(r.amount),
    splitType: r.split_type,
    recurring: !!r.recurring,
    percentages: r.percentages ?? {},
    customs: r.customs ?? {},
    splits: r.splits ?? {},
  };
}

function mapUtility(r: any): Utility {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    recurring: !!r.recurring,
    splits: r.splits ?? {},
    date: r.date,
    archived: !!r.archived,
    period: r.period ?? undefined,
  };
}

function mapExpense(r: any): Expense {
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by_name,
    status: r.status,
    splits: r.splits ?? undefined,
    splitMode: r.split_mode ?? undefined,
    images: r.images ?? [],
    date: r.date,
    archived: !!r.archived,
    period: r.period ?? undefined,
  };
}

function mapPayment(r: any): Payment {
  return {
    id: r.id,
    fromId: r.from_id,
    fromName: r.from_name,
    toId: r.to_id,
    toName: r.to_name,
    amount: Number(r.amount),
    status: r.status,
    date: r.date,
    archived: !!r.archived,
    period: r.period ?? undefined,
  };
}

function mapPeriod(r: any): ClosedPeriod {
  return {
    id: r.id,
    period: r.period,
    closedAt: r.closed_at,
    carryover: (r.carryover ?? []) as Settlement[],
    totals: {
      spend: Number(r.totals?.spend ?? 0),
      expenses: Number(r.totals?.expenses ?? 0),
      payments: Number(r.totals?.payments ?? 0),
    },
  };
}

function mapGroup(row: any): Group {
  const rentRow = Array.isArray(row.rent) ? row.rent[0] : row.rent;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    smartSettle: !!row.smart_settle,
    members: (row.group_members ?? []).map(mapMember),
    rent: mapRent(rentRow),
    utilities: (row.utilities ?? []).map(mapUtility),
    expenses: (row.expenses ?? []).map(mapExpense),
    payments: (row.payments ?? []).map(mapPayment),
    subgroups: (row.subgroups ?? []) as Subgroup[],
    chores: (row.chores ?? []) as Chore[],
    periods: (row.group_periods ?? [])
      .map(mapPeriod)
      .sort((a: ClosedPeriod, b: ClosedPeriod) =>
        a.period.localeCompare(b.period)
      ),
    docsVersion: Number(row.docs_version ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchMyGroups(
  supabase: SupabaseClient,
  myUserId: string
): Promise<LoadedGroup[]> {
  const { data, error } = await selectGroups(supabase).order("created_at", {
    ascending: true,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const group = mapGroup(row);
    const mine = (row.group_members ?? []).find(
      (m: any) => m.user_id === myUserId
    );
    return { group, myMemberId: mine?.id ?? "" };
  });
}

export async function fetchGroup(
  supabase: SupabaseClient,
  groupId: string,
  myUserId: string
): Promise<LoadedGroup | null> {
  const { data, error } = await selectGroups(supabase)
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row: any = data;
  const mine = (row.group_members ?? []).find(
    (m: any) => m.user_id === myUserId
  );
  return { group: mapGroup(row), myMemberId: mine?.id ?? "" };
}

// ---------------------------------------------------------------------------
// Group lifecycle (via SECURITY DEFINER RPCs)
// ---------------------------------------------------------------------------

export async function createGroup(
  supabase: SupabaseClient,
  groupName: string
): Promise<string> {
  const { data, error } = await supabase.rpc("create_group", {
    p_group_name: groupName,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Joins a group by invite code.
 *
 * The RPC returns null for a code that doesn't match anything — it records the
 * miss for rate-limiting purposes rather than raising, since an exception would
 * roll the attempt back.
 */
export async function joinGroup(
  supabase: SupabaseClient,
  code: string,
  displayName: string,
  venmo: string
): Promise<string> {
  const { data, error } = await supabase.rpc("join_group", {
    p_code: code,
    p_display_name: displayName,
    p_venmo: venmo,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That invite code didn't match a group");
  return data as string;
}

/** Hands the treasurer role to another member. Current treasurer only. */
export async function transferTreasurer(
  supabase: SupabaseClient,
  groupId: string,
  memberId: string
): Promise<void> {
  const { error } = await supabase.rpc("transfer_treasurer", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error) throw new Error(error.message);
}

// Remove the current user's own membership row. RLS (members_delete) allows a
// member to delete themselves, so no RPC is needed. A zero-row result means the
// delete was blocked (e.g. stale membership), which we surface as an error.
export async function leaveGroup(
  supabase: SupabaseClient,
  memberId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("you don't have permission to leave this group");
  }
}

// ---------------------------------------------------------------------------
// Monthly close-out and the archive
// ---------------------------------------------------------------------------

/**
 * Closes a month. The carry-forward is computed by the caller from what the
 * treasurer can see; the database checks who is asking and that each debt is
 * between two people in the group.
 */
export async function closePeriod(
  supabase: SupabaseClient,
  groupId: string,
  period: string,
  carryover: Settlement[],
  totals: PeriodTotals
): Promise<void> {
  const { error } = await supabase.rpc("close_period", {
    p_group_id: groupId,
    p_period: period,
    p_carryover: carryover,
    p_totals: totals,
  });
  if (error) throw new Error(error.message);
}

/**
 * One page of a closed month. Asking for one row more than requested is how we
 * know whether a "Show more" button is worth offering, without a count query.
 */
async function fetchArchivedRows<Row, T>(
  supabase: SupabaseClient,
  table: "expenses" | "payments",
  columns: string,
  groupId: string,
  period: string,
  offset: number,
  limit: number,
  map: (row: Row) => T
): Promise<Page<T>> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("group_id", groupId)
    .eq("period", period)
    .order("date", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  return { items: rows.slice(0, limit).map(map), hasMore: rows.length > limit };
}

export function fetchArchivedExpenses(
  supabase: SupabaseClient,
  groupId: string,
  period: string,
  offset: number,
  limit: number
): Promise<Page<Expense>> {
  return fetchArchivedRows(
    supabase,
    "expenses",
    "id, submitted_by, submitted_by_name, description, amount, status, splits, split_mode, images, date, archived, period",
    groupId,
    period,
    offset,
    limit,
    mapExpense
  );
}

export function fetchArchivedPayments(
  supabase: SupabaseClient,
  groupId: string,
  period: string,
  offset: number,
  limit: number
): Promise<Page<Payment>> {
  return fetchArchivedRows(
    supabase,
    "payments",
    "id, from_id, from_name, to_id, to_name, amount, status, date, archived, period",
    groupId,
    period,
    offset,
    limit,
    mapPayment
  );
}

/**
 * Every archived row for one month, for the CSV export.
 *
 * The archive view pages so a long month doesn't stall the UI, but an export
 * that stopped at ten rows would be worse than no export at all.
 */
export async function fetchArchivedMonth(
  supabase: SupabaseClient,
  groupId: string,
  period: string
): Promise<{ expenses: Expense[]; payments: Payment[] }> {
  const size = 200;
  const cap = 10_000;

  async function drain<T>(
    load: (offset: number, limit: number) => Promise<Page<T>>
  ): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; offset < cap; offset += size) {
      const page = await load(offset, size);
      all.push(...page.items);
      if (!page.hasMore) break;
    }
    return all;
  }

  const [expenses, payments] = await Promise.all([
    drain((offset, limit) =>
      fetchArchivedExpenses(supabase, groupId, period, offset, limit)
    ),
    drain((offset, limit) =>
      fetchArchivedPayments(supabase, groupId, period, offset, limit)
    ),
  ]);
  return { expenses, payments };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface ProfileFields {
  /** Omitted when no group is loaded, so a placeholder can't overwrite it. */
  name?: string;
  venmo: string;
  zelle: string;
  avatarUrl?: string;
}

/**
 * Saves the signed-in user's contact details.
 *
 * These live in two places: `profiles` (the account record, which seeds new
 * memberships) and a denormalised copy on every `group_members` row. Both are
 * updated so the change is reflected in each group the user belongs to.
 */
export async function updateMyProfile(
  supabase: SupabaseClient,
  userId: string,
  fields: ProfileFields
): Promise<void> {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      ...(fields.name === undefined ? {} : { name: fields.name }),
      venmo: fields.venmo,
      zelle: fields.zelle,
      avatar_url: fields.avatarUrl ?? null,
    })
    .eq("id", userId);
  if (profileError) throw new Error(profileError.message);

  // Deliberately does not touch `name`: display names are per-group and must
  // stay unique within a group, so renaming happens in the group's own UI.
  const { error: membersError } = await supabase
    .from("group_members")
    .update({
      venmo: fields.venmo,
      zelle: fields.zelle,
      avatar_url: fields.avatarUrl ?? null,
    })
    .eq("user_id", userId);
  if (membersError) throw new Error(membersError.message);
}

// ---------------------------------------------------------------------------
// Diff-based persistence: compares a previous and next Group and writes only
// what changed. Called from the app's setGroup wrapper, so the individual tabs
// need no changes.
//
// Three failure modes are detected:
//   1. The write returned an error (constraint violation, RPC rejection, etc.).
//   2. The write "succeeded" but affected fewer rows than expected — this is
//      what an RLS-blocked UPDATE/DELETE looks like (PostgREST filters the
//      rows out silently instead of erroring).
//   3. A serialization_failure (40001), meaning another roommate changed the
//      same data first and this edit was built on a stale copy.
//
// Anything that changes money or permissions goes through an RPC rather than a
// table write, so the rules live in the database where they can't be bypassed.
// ---------------------------------------------------------------------------

/** Postgres serialization_failure, raised by update_group_docs on a stale write. */
const CONFLICT_CODE = "40001";

function indexById<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((x) => [x.id, x]));
}

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

interface WriteResult {
  error: { message: string; code?: string } | null;
  data?: unknown;
}

export interface WriteOp {
  label: string;
  run: PromiseLike<WriteResult>;
  /** Minimum number of rows the write must affect (requires .select()). */
  expectRows?: number;
  /** Receives the returned payload when the write succeeds. */
  onSuccess?: (data: unknown) => void;
}

export interface PersistResult {
  /** Human-readable failures; empty means everything saved. */
  errors: string[];
  /** New chores/subgroups document version, when those were written. */
  docsVersion?: number;
  /** True when a write lost a race with another roommate's edit. */
  conflict?: boolean;
}

async function runOps(ops: WriteOp[]): Promise<PersistResult> {
  let conflict = false;

  const results = await Promise.all(
    ops.map(async (op): Promise<string | null> => {
      try {
        const res = await op.run;
        if (res.error) {
          if (res.error.code === CONFLICT_CODE) conflict = true;
          return `${op.label}: ${res.error.message}`;
        }
        if (op.expectRows !== undefined) {
          const rows = Array.isArray(res.data)
            ? res.data.length
            : res.data
              ? 1
              : 0;
          if (rows < op.expectRows) {
            return `${op.label}: you don't have permission to make this change`;
          }
        }
        op.onSuccess?.(res.data);
        return null;
      } catch (e) {
        return `${op.label}: ${(e as Error).message}`;
      }
    })
  );

  const errors = results.filter((r): r is string => r !== null);
  return conflict ? { errors, conflict } : { errors };
}

// Writes for one group run one batch at a time. Without this, two quick edits
// fire two independent batches whose completion order is undefined, and the
// database can settle on the earlier value while the UI shows the later one.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueGroupWrite<T>(
  groupId: string,
  task: () => Promise<T>
): Promise<T> {
  const tail = writeQueues.get(groupId) ?? Promise.resolve();
  // Run regardless of whether the previous batch resolved or rejected, so one
  // failure doesn't wedge the queue.
  const result = tail.then(task, task);
  const settled = result.then(
    () => undefined,
    () => undefined
  );
  writeQueues.set(groupId, settled);
  void settled.then(() => {
    if (writeQueues.get(groupId) === settled) writeQueues.delete(groupId);
  });
  return result;
}

/**
 * Builds the write operations needed to turn `prev` into `next` in the
 * database. Exported for tests; the app calls persistGroupDiff.
 */
export function buildGroupOps(
  supabase: SupabaseClient,
  prev: Group,
  next: Group,
  onDocsVersion?: (version: number) => void
): WriteOp[] {
  const gid = next.id;
  const ops: WriteOp[] = [];

  // --- groups row: treasurer-only scalars via direct update ---
  if (prev.name !== next.name || prev.smartSettle !== next.smartSettle) {
    ops.push({
      label: "Group settings",
      run: supabase
        .from("groups")
        .update({ name: next.name, smart_settle: next.smartSettle })
        .eq("id", gid)
        .select("id"),
      expectRows: 1,
    });
  }

  // --- chores & subgroups: any member may edit, so go through the
  //     update_group_docs RPC (the groups UPDATE policy is treasurer-only).
  //     The version we read comes along so the server can reject the write if
  //     someone else has changed these documents in the meantime. ---
  if (
    changed(prev.subgroups, next.subgroups) ||
    changed(prev.chores, next.chores)
  ) {
    ops.push({
      label: "Chores & floors",
      run: supabase.rpc("update_group_docs", {
        p_group_id: gid,
        p_subgroups: next.subgroups,
        p_chores: next.chores,
        p_version: prev.docsVersion,
      }),
      onSuccess: (data) => {
        if (typeof data === "number") onDocsVersion?.(data);
      },
    });
  }

  // --- members ---
  {
    const prevM = indexById(prev.members);
    const nextM = indexById(next.members);
    for (const m of prev.members) {
      if (!nextM.has(m.id)) {
        ops.push({
          label: `Removing ${m.name}`,
          run: supabase
            .from("group_members")
            .delete()
            .eq("id", m.id)
            .select("id"),
          expectRows: 1,
        });
      }
    }
    for (const m of next.members) {
      const old = prevM.get(m.id);
      if (!old || !changed(old, m)) continue;

      // Promotion is a permission change, so it has its own RPC. The matching
      // demotion of the outgoing treasurer happens inside it — no separate op.
      if (!old.isTreasurer && m.isTreasurer) {
        ops.push({
          label: `Making ${m.name} treasurer`,
          run: supabase.rpc("transfer_treasurer", {
            p_group_id: gid,
            p_member_id: m.id,
          }),
        });
      }

      if (
        old.name !== m.name ||
        old.venmo !== m.venmo ||
        old.zelle !== m.zelle ||
        old.avatarUrl !== m.avatarUrl
      ) {
        ops.push({
          label: `Updating ${m.name}`,
          run: supabase
            .from("group_members")
            .update({
              name: m.name,
              venmo: m.venmo,
              zelle: m.zelle,
              avatar_url: m.avatarUrl ?? null,
            })
            .eq("id", m.id)
            .select("id"),
          expectRows: 1,
        });
      }
    }
  }

  // --- rent (0 or 1 row per group) ---
  if (changed(prev.rent, next.rent)) {
    if (next.rent) {
      ops.push({
        label: "Rent",
        run: supabase
          .from("rent")
          .upsert(
            {
              group_id: gid,
              amount: next.rent.amount,
              split_type: next.rent.splitType,
              recurring: next.rent.recurring,
              percentages: next.rent.percentages,
              customs: next.rent.customs,
              splits: next.rent.splits,
            },
            { onConflict: "group_id" }
          )
          .select("id"),
        expectRows: 1,
      });
    } else {
      ops.push({
        label: "Removing rent",
        run: supabase.from("rent").delete().eq("group_id", gid).select("id"),
        expectRows: 1,
      });
    }
  }

  // --- utilities ---
  {
    const prevU = indexById(prev.utilities);
    const nextU = indexById(next.utilities);
    for (const u of prev.utilities) {
      if (!nextU.has(u.id))
        ops.push({
          label: `Removing bill "${u.name}"`,
          run: supabase.from("utilities").delete().eq("id", u.id).select("id"),
          expectRows: 1,
        });
    }
    const upserts = next.utilities
      .filter((u) => !prevU.has(u.id) || changed(prevU.get(u.id), u))
      .map((u) => ({
        id: u.id,
        group_id: gid,
        name: u.name,
        amount: u.amount,
        recurring: u.recurring,
        splits: u.splits,
        date: u.date,
        archived: u.archived ?? false,
        period: u.period ?? null,
      }));
    if (upserts.length)
      ops.push({
        label: "Bills",
        run: supabase.from("utilities").upsert(upserts).select("id"),
        expectRows: upserts.length,
      });
  }

  // --- expenses (insert = submitter only; update = treasurer approve/deny) ---
  {
    const prevE = indexById(prev.expenses);
    const nextE = indexById(next.expenses);
    for (const e of prev.expenses) {
      if (!nextE.has(e.id))
        ops.push({
          label: `Removing expense "${e.description}"`,
          run: supabase.from("expenses").delete().eq("id", e.id).select("id"),
          expectRows: 1,
        });
    }
    // A submission always starts pending with no splits; the database enforces
    // both, so there is nothing to gain by sending anything else.
    const inserts = next.expenses
      .filter((e) => !prevE.has(e.id))
      .map((e) => ({
        id: e.id,
        group_id: gid,
        submitted_by: e.submittedBy,
        submitted_by_name: e.submittedByName,
        description: e.description,
        amount: e.amount,
        status: "pending",
        splits: null,
        images: e.images ?? [],
        date: e.date,
      }));
    if (inserts.length)
      ops.push({
        label: "New expense",
        run: supabase.from("expenses").insert(inserts).select("id"),
        expectRows: inserts.length,
      });

    for (const e of next.expenses) {
      const old = prevE.get(e.id);
      if (!old || !changed(old, e)) continue;

      // Approving, denying and reopening are treasurer decisions that move
      // money, so each has an RPC that re-checks the caller and (for approval)
      // validates that the splits add up to the total.
      if (old.status !== e.status) {
        if (e.status === "approved") {
          ops.push({
            label: `Approving "${e.description}"`,
            run: supabase.rpc("approve_expense", {
              p_expense_id: e.id,
              p_splits: e.splits ?? null,
              p_mode: e.splitMode ?? "even",
            }),
          });
        } else if (e.status === "denied") {
          ops.push({
            label: `Denying "${e.description}"`,
            run: supabase.rpc("deny_expense", { p_expense_id: e.id }),
          });
        } else {
          ops.push({
            label: `Reopening "${e.description}"`,
            run: supabase.rpc("reopen_expense", { p_expense_id: e.id }),
          });
        }
        continue;
      }

      ops.push({
        label: `Expense "${e.description}"`,
        run: supabase.rpc("update_expense", {
          p_expense_id: e.id,
          p_description: e.description,
          p_amount: e.amount,
          p_images: e.images ?? [],
        }),
      });
    }
  }

  // --- payments (insert = payer only; update = recipient/treasurer confirm) ---
  {
    const prevP = indexById(prev.payments);
    const nextP = indexById(next.payments);
    for (const p of prev.payments) {
      if (!nextP.has(p.id))
        ops.push({
          label: "Removing payment",
          run: supabase.from("payments").delete().eq("id", p.id).select("id"),
          expectRows: 1,
        });
    }
    const inserts = next.payments
      .filter((p) => !prevP.has(p.id))
      .map((p) => ({
        id: p.id,
        group_id: gid,
        from_id: p.fromId,
        from_name: p.fromName,
        to_id: p.toId,
        to_name: p.toName,
        amount: p.amount,
        status: "pending",
        date: p.date,
      }));
    if (inserts.length)
      ops.push({
        label: "Recording payment",
        run: supabase.from("payments").insert(inserts).select("id"),
        expectRows: inserts.length,
      });

    // Status is the only mutable field, and only the recipient (or treasurer)
    // may change it — enforced inside confirm_payment.
    for (const p of next.payments) {
      const old = prevP.get(p.id);
      if (old && old.status !== p.status) {
        ops.push({
          label: "Updating payment",
          run: supabase.rpc("confirm_payment", {
            p_payment_id: p.id,
            p_status: p.status,
          }),
        });
      }
    }
  }

  return ops;
}

export async function persistGroupDiff(
  supabase: SupabaseClient,
  prev: Group,
  next: Group
): Promise<PersistResult> {
  return enqueueGroupWrite(next.id, async () => {
    let docsVersion: number | undefined;
    const ops = buildGroupOps(supabase, prev, next, (v) => {
      docsVersion = v;
    });
    const result = await runOps(ops);
    if (result.errors.length) {
      reportError("Some group writes failed", undefined, {
        failures: result.errors,
      });
    }
    return docsVersion === undefined ? result : { ...result, docsVersion };
  });
}
