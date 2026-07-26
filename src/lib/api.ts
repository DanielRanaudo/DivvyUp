import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Group,
  Member,
  RentConfig,
  Utility,
  Expense,
  Payment,
  Subgroup,
  Chore,
} from "@/lib/types";

export interface LoadedGroup {
  group: Group;
  myMemberId: string;
}

const GROUP_SELECT = `
  id, name, code, smart_settle, subgroups, chores, created_by,
  group_members ( id, user_id, name, venmo, is_treasurer ),
  rent ( amount, split_type, recurring, percentages, customs, splits ),
  utilities ( id, name, amount, recurring, splits, date ),
  expenses ( id, submitted_by, submitted_by_name, description, amount, status, splits, images, date ),
  payments ( id, from_id, from_name, to_id, to_name, amount, status, date )
`;

// ---------------------------------------------------------------------------
// Row -> app-type mapping
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapMember(r: any): Member {
  return {
    id: r.id,
    name: r.name,
    venmo: r.venmo ?? "",
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
    images: r.images ?? [],
    date: r.date,
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
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchMyGroups(
  supabase: SupabaseClient,
  myUserId: string
): Promise<LoadedGroup[]> {
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_SELECT)
    .order("created_at", { ascending: true });
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
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_SELECT)
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
  return data as string;
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
// Diff-based persistence: compares a previous and next Group and writes only
// what changed. Called from the app's setGroup wrapper, so the individual tabs
// need no changes.
//
// Returns a list of human-readable error messages (empty = everything saved).
// Two failure modes are detected:
//   1. The write returned an error (constraint violation, network, etc.).
//   2. The write "succeeded" but affected fewer rows than expected — this is
//      what an RLS-blocked UPDATE/DELETE looks like (PostgREST filters the
//      rows out silently instead of erroring).
// ---------------------------------------------------------------------------

function indexById<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((x) => [x.id, x]));
}

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

interface WriteOp {
  label: string;
  run: PromiseLike<{ error: { message: string } | null; data?: unknown }>;
  /** Minimum number of rows the write must affect (requires .select()). */
  expectRows?: number;
}

async function runOps(ops: WriteOp[]): Promise<string[]> {
  const results = await Promise.all(
    ops.map(async (op): Promise<string | null> => {
      try {
        const res = await op.run;
        if (res.error) return `${op.label}: ${res.error.message}`;
        if (op.expectRows !== undefined) {
          const rows = Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0;
          if (rows < op.expectRows) {
            return `${op.label}: you don't have permission to make this change`;
          }
        }
        return null;
      } catch (e) {
        return `${op.label}: ${(e as Error).message}`;
      }
    })
  );
  return results.filter((r): r is string => r !== null);
}

export async function persistGroupDiff(
  supabase: SupabaseClient,
  prev: Group,
  next: Group
): Promise<string[]> {
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
  //     update_group_docs RPC (the groups UPDATE policy is treasurer-only) ---
  if (changed(prev.subgroups, next.subgroups) || changed(prev.chores, next.chores)) {
    ops.push({
      label: "Chores & floors",
      run: supabase.rpc("update_group_docs", {
        p_group_id: gid,
        p_subgroups: next.subgroups,
        p_chores: next.chores,
      }),
    });
  }

  // --- members (client only removes members; edits handled too) ---
  {
    const prevM = indexById(prev.members);
    const nextM = indexById(next.members);
    for (const m of prev.members) {
      if (!nextM.has(m.id)) {
        ops.push({
          label: `Removing ${m.name}`,
          run: supabase.from("group_members").delete().eq("id", m.id).select("id"),
          expectRows: 1,
        });
      }
    }
    for (const m of next.members) {
      const old = prevM.get(m.id);
      if (old && changed(old, m)) {
        ops.push({
          label: `Updating ${m.name}`,
          run: supabase
            .from("group_members")
            .update({
              name: m.name,
              venmo: m.venmo,
              is_treasurer: m.isTreasurer,
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
    const inserts = next.expenses
      .filter((e) => !prevE.has(e.id))
      .map((e) => ({
        id: e.id,
        group_id: gid,
        submitted_by: e.submittedBy,
        submitted_by_name: e.submittedByName,
        description: e.description,
        amount: e.amount,
        status: e.status,
        splits: e.splits ?? null,
        images: e.images ?? [],
        date: e.date,
      }));
    if (inserts.length)
      ops.push({
        label: "New expense",
        run: supabase.from("expenses").insert(inserts),
      });
    for (const e of next.expenses) {
      const old = prevE.get(e.id);
      if (old && changed(old, e)) {
        ops.push({
          label: `Expense "${e.description}"`,
          run: supabase
            .from("expenses")
            .update({
              description: e.description,
              amount: e.amount,
              status: e.status,
              splits: e.splits ?? null,
              images: e.images ?? [],
            })
            .eq("id", e.id)
            .select("id"),
          expectRows: 1,
        });
      }
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
        status: p.status,
        date: p.date,
      }));
    if (inserts.length)
      ops.push({
        label: "Recording payment",
        run: supabase.from("payments").insert(inserts),
      });
    for (const p of next.payments) {
      const old = prevP.get(p.id);
      if (old && changed(old, p)) {
        ops.push({
          label: "Updating payment",
          run: supabase
            .from("payments")
            .update({ status: p.status })
            .eq("id", p.id)
            .select("id"),
          expectRows: 1,
        });
      }
    }
  }

  const errors = await runOps(ops);
  if (errors.length) {
    console.error("persistGroupDiff: some writes failed", errors);
  }
  return errors;
}
