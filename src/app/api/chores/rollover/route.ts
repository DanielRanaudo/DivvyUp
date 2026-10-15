import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/config";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
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

/**
 * Reconciles every household as a backstop for groups nobody opens that day.
 * The database applies each transition under a row lock and computes "today"
 * in that household's timezone, so retries are safe and cannot double-rotate.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const missing = [
    SUPABASE_URL === "" && "NEXT_PUBLIC_SUPABASE_URL",
    SERVICE_KEY === "" && "SUPABASE_SERVICE_ROLE_KEY",
    CRON_SECRET === "" && "CRON_SECRET",
  ].filter((name): name is string => typeof name === "string");

  if (missing.length > 0) {
    return NextResponse.json(
      { skipped: `Chore rollover is off: set ${missing.join(", ")}.` },
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
    const { data, error } = await supabase.rpc(
      "reconcile_all_chore_rotations"
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ updatedGroups: data ?? 0 });
  } catch (error) {
    reportError("Chore rollover run failed", error);
    return NextResponse.json(
      { error: "The chore rollover run failed." },
      { status: 500 }
    );
  }
}
