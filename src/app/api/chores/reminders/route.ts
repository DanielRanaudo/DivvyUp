import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildChoreDigests,
  type ChoreDigest,
  type ChoreReminderGroup,
  type ChoreReminderMember,
} from "@/lib/choreReminders";
import { SITE_URL, SUPABASE_URL } from "@/lib/config";
import { reportError } from "@/lib/observability";
import type { Chore } from "@/lib/types";

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

async function send(mail: ChoreDigest, runDate: string): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `chore-digest/${runDate}/${mail.recipientId}`,
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

/** Sends every account its chore list for the household's current date. */
export async function GET(request: Request): Promise<NextResponse> {
  const missing = [
    SUPABASE_URL === "" && "NEXT_PUBLIC_SUPABASE_URL",
    SERVICE_KEY === "" && "SUPABASE_SERVICE_ROLE_KEY",
    RESEND_KEY === "" && "RESEND_API_KEY",
    FROM === "" && "REMINDER_FROM",
    CRON_SECRET === "" && "CRON_SECRET",
  ].filter((name): name is string => typeof name === "string");

  if (missing.length > 0) {
    return NextResponse.json(
      { skipped: `Chore reminders are off: set ${missing.join(", ")}.` },
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
    // Reconcile first so a household does not depend on someone opening the app
    // before its morning digest is built.
    const rollover = await supabase.rpc("reconcile_all_chore_rotations");
    if (rollover.error) throw new Error(rollover.error.message);

    const groups = await supabase
      .from("groups")
      .select("id, name, timezone, chores");
    if (groups.error) throw new Error(groups.error.message);

    type GroupJoin = Omit<ChoreReminderGroup, "chores"> & {
      chores: Chore[] | null;
    };
    const groupRows = ((groups.data ?? []) as GroupJoin[]).map((group) => ({
      ...group,
      chores: Array.isArray(group.chores) ? group.chores : [],
    }));
    const groupIds = groupRows.map((group) => group.id);
    if (groupIds.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 });
    }

    const members = await supabase
      .from("group_members")
      .select("id, user_id, group_id, name, profiles(email)")
      .in("group_id", groupIds);
    if (members.error) throw new Error(members.error.message);

    type Profile = { email: string | null };
    type MemberJoin = {
      id: string;
      user_id: string;
      group_id: string;
      name: string;
      profiles: Profile | Profile[] | null;
    };
    const memberRows: ChoreReminderMember[] = (
      (members.data ?? []) as unknown as MemberJoin[]
    ).map(({ user_id, group_id, profiles, ...member }) => ({
      ...member,
      userId: user_id,
      groupId: group_id,
      email: (Array.isArray(profiles) ? profiles[0] : profiles)?.email ?? null,
    }));

    const now = new Date();
    const mail = buildChoreDigests(groupRows, memberRows, SITE_URL, now);
    const runDate = now.toISOString().slice(0, 10);
    const results = await Promise.allSettled(
      mail.map((message) => send(message, runDate))
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      reportError(`${failed} chore reminder email(s) failed to send`);
    }

    return NextResponse.json({ sent: mail.length - failed, failed });
  } catch (error) {
    reportError("Chore reminder run failed", error);
    return NextResponse.json(
      { error: "The chore reminder run failed." },
      { status: 500 }
    );
  }
}
