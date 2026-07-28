import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SITE_URL, SUPABASE_URL } from "@/lib/config";
import { reportError } from "@/lib/observability";
import {
  buildReminders,
  tasksFrom,
  type GroupRow,
  type MemberRow,
  type PendingExpenseRow,
  type PendingPaymentRow,
  type Reminder,
} from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.REMINDER_FROM ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** Compares without leaking, through timing, how much of the secret matched. */
function secretMatches(header: string | null): boolean {
  const given = header?.replace(/^Bearer /, "") ?? "";
  if (given.length !== CRON_SECRET.length) return false;
  let same = 0;
  for (let i = 0; i < given.length; i++) {
    same |= given.charCodeAt(i) ^ CRON_SECRET.charCodeAt(i);
  }
  return same === 0;
}

async function send(mail: Reminder): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend refused the message (${response.status})`);
  }
}

/**
 * Sends each person one summary of what is waiting on them.
 *
 * Called on a schedule (see vercel.json) rather than when something is
 * submitted, so a treasurer who approves within the day is never emailed at
 * all. Runs with the service-role key because it deliberately reads across
 * every group, which no signed-in user is allowed to do.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const missing = [
    SERVICE_KEY === "" && "SUPABASE_SERVICE_ROLE_KEY",
    RESEND_KEY === "" && "RESEND_API_KEY",
    FROM === "" && "REMINDER_FROM",
    CRON_SECRET === "" && "CRON_SECRET",
  ].filter((name): name is string => typeof name === "string");

  if (missing.length > 0) {
    return NextResponse.json(
      { skipped: `Reminders are off: set ${missing.join(", ")}.` },
      { status: 501 }
    );
  }

  if (!secretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const [expenses, payments] = await Promise.all([
      supabase
        .from("expenses")
        .select("group_id, description, amount, date, submitted_by_name")
        .eq("status", "pending")
        .eq("archived", false),
      supabase
        .from("payments")
        .select("group_id, to_id, from_name, amount, date")
        .eq("status", "pending")
        .eq("archived", false),
    ]);
    if (expenses.error) throw new Error(expenses.error.message);
    if (payments.error) throw new Error(payments.error.message);

    const expenseRows = (expenses.data ?? []) as PendingExpenseRow[];
    const paymentRows = (payments.data ?? []) as PendingPaymentRow[];
    const groupIds = [
      ...new Set([
        ...expenseRows.map((e) => e.group_id),
        ...paymentRows.map((p) => p.group_id),
      ]),
    ];
    if (groupIds.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const [groups, members] = await Promise.all([
      supabase.from("groups").select("id, name").in("id", groupIds),
      supabase
        .from("group_members")
        .select("id, group_id, name, is_treasurer, profiles(email)")
        .in("group_id", groupIds),
    ]);
    if (groups.error) throw new Error(groups.error.message);
    if (members.error) throw new Error(members.error.message);

    type Profile = { email: string | null };
    // Supabase types an embedded row as an array; at runtime it is one object.
    type MemberJoin = Omit<MemberRow, "email"> & {
      profiles: Profile | Profile[] | null;
    };
    const memberRows: MemberRow[] = (
      (members.data ?? []) as unknown as MemberJoin[]
    ).map(({ profiles, ...m }) => ({
      ...m,
      email: (Array.isArray(profiles) ? profiles[0] : profiles)?.email ?? null,
    }));

    const mail = buildReminders(
      tasksFrom(
        (groups.data ?? []) as GroupRow[],
        memberRows,
        expenseRows,
        paymentRows
      ),
      SITE_URL
    );

    // One failing address shouldn't stop the rest of the run.
    const results = await Promise.allSettled(mail.map(send));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      reportError(`${failed} reminder email(s) failed to send`);
    }

    return NextResponse.json({ sent: mail.length - failed, failed });
  } catch (error) {
    reportError("Reminder run failed", error);
    return NextResponse.json(
      { error: "The reminder run failed." },
      { status: 500 }
    );
  }
}
