import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, SITE_URL } from "@/lib/config";
import {
  buildCalendarFeed,
  type CalendarFeedGroup,
} from "@/lib/calendarFeed";
import { todayISO } from "@/lib/chores";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FeedPayload {
  groups: CalendarFeedGroup[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: tokenWithExtension } = await params;
  const match = /^([0-9a-f]{64})\.ics$/.exec(tokenWithExtension);
  if (!match || !SUPABASE_URL || !SUPABASE_ANON_KEY) return notFound();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("read_calendar_feed", {
    p_token: match[1],
  });

  if (error) {
    reportError("Calendar feed read failed", error);
    return new Response("The calendar feed is temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!isFeedPayload(data)) return notFound();

  const body = buildCalendarFeed(data.groups, {
    today: todayISO(),
    siteUrl: SITE_URL,
  });
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const headers = calendarHeaders(etag);

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { headers });
}

function isFeedPayload(value: unknown): value is FeedPayload {
  if (!value || typeof value !== "object") return false;
  const groups = (value as { groups?: unknown }).groups;
  return Array.isArray(groups) && groups.every(isFeedGroup);
}

function isFeedGroup(value: unknown): value is CalendarFeedGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<CalendarFeedGroup>;
  return (
    typeof group.groupId === "string" &&
    typeof group.groupName === "string" &&
    typeof group.memberId === "string" &&
    Array.isArray(group.chores) &&
    typeof group.docsVersion === "number" &&
    typeof group.updatedAt === "string"
  );
}

function calendarHeaders(etag: string): HeadersInit {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="divvyup-chores.ics"',
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
}

function notFound(): Response {
  return new Response("Calendar feed not found.\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

