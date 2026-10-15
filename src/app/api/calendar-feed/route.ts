import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HAS_SUPABASE, SITE_URL } from "@/lib/config";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

async function authenticated() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

/** Returns whether the signed-in user already has an active private feed. */
export async function GET() {
  if (!HAS_SUPABASE) return backendUnavailable();
  const { supabase, user } = await authenticated();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("calendar_feed_tokens")
    .select("created_at, rotated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    reportError("Calendar feed status failed", error);
    return NextResponse.json(
      { error: "Couldn't check the calendar feed." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      active: data !== null,
      createdAt: data?.created_at ?? null,
      rotatedAt: data?.rotated_at ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Creates or rotates the token and returns the raw subscription URL once. */
export async function POST() {
  if (!HAS_SUPABASE) return backendUnavailable();
  const { supabase, user } = await authenticated();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("rotate_calendar_feed_token");
  if (error || typeof data !== "string") {
    reportError("Calendar feed token rotation failed", error);
    return NextResponse.json(
      { error: "Couldn't create the calendar link." },
      { status: 500 }
    );
  }

  const url = new URL(`/api/calendar/${data}.ics`, SITE_URL).toString();
  return NextResponse.json(
    { active: true, url },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Disables the feed. Google will receive a 404 the next time it refreshes. */
export async function DELETE() {
  if (!HAS_SUPABASE) return backendUnavailable();
  const { supabase, user } = await authenticated();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("calendar_feed_tokens")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    reportError("Calendar feed disable failed", error);
    return NextResponse.json(
      { error: "Couldn't disable the calendar feed." },
      { status: 500 }
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

function backendUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Calendar feeds need a configured backend." },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

