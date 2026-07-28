"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGroup } from "@/lib/api";
import { reportError } from "@/lib/observability";
import type { Group } from "@/lib/types";

/** The tables whose rows belong to one group. */
const WATCHED = [
  "groups",
  "group_members",
  "rent",
  "utilities",
  "expenses",
  "payments",
];

/** A burst of changes from one action arrives as several events. */
const SETTLE_MS = 250;

interface GroupRealtimeOptions {
  supabase: SupabaseClient | null;
  userId: string | null;
  groupId: string | null;
  /** The group as the server now holds it. */
  onGroup: (group: Group) => void;
  /** You are no longer in the group, or it is gone. */
  onGone: () => void;
  /**
   * True while one of our own writes is still in flight. Replacing state now
   * would discard the edit that write is saving, so the refetch waits.
   */
  isBusy: () => boolean;
}

/**
 * Keeps the open group in step with the server while other people are editing
 * it, and hands back a way to run the refetch that had to wait.
 */
export function useGroupRealtime({
  supabase,
  userId,
  groupId,
  onGroup,
  onGone,
  isBusy,
}: GroupRealtimeOptions): { refetchNow: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferred = useRef<(() => void) | null>(null);
  // Held in a ref so a new callback identity doesn't tear down the channel and
  // resubscribe, which would miss anything that changed in between.
  const handlers = useRef({ onGroup, onGone, isBusy });
  useEffect(() => {
    handlers.current = { onGroup, onGone, isBusy };
  }, [onGroup, onGone, isBusy]);

  useEffect(() => {
    if (!supabase || !userId || !groupId) return;

    const refetch = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        if (handlers.current.isBusy()) {
          deferred.current = refetch;
          return;
        }
        deferred.current = null;
        try {
          const loaded = await fetchGroup(supabase, groupId, userId);
          if (loaded) handlers.current.onGroup(loaded.group);
          else handlers.current.onGone();
        } catch (e) {
          reportError("Realtime refetch failed", e, { groupId });
        }
      }, SETTLE_MS);
    };

    const channel = supabase.channel(`group-${groupId}`);
    WATCHED.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter:
            table === "groups" ? `id=eq.${groupId}` : `group_id=eq.${groupId}`,
        },
        refetch
      );
    });
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      deferred.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, groupId]);

  return {
    refetchNow: () => deferred.current?.(),
  };
}
