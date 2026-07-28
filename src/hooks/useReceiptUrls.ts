"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDirectlyViewable, signReceiptRefs } from "@/lib/receipts";

/**
 * Turns stored receipt references into URLs a browser can load.
 *
 * The receipts bucket is private, so an object path has to be exchanged for a
 * short-lived signed URL before it can be shown. Sandbox data URLs and the
 * public URLs written before the bucket was locked down are already viewable
 * and pass straight through.
 *
 * Returns a map from reference to URL; an entry is an empty string while its
 * signature is still in flight or if signing failed.
 */
export function useReceiptUrls(
  supabase: SupabaseClient | null,
  refs: string[]
): Record<string, string> {
  // Joining into a string keeps the effect from re-running on every render just
  // because the caller built a new array.
  const key = refs.join("\n");
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!supabase) return;
    const needed = (key ? key.split("\n") : []).filter(
      (ref) => !isDirectlyViewable(ref)
    );
    if (needed.length === 0) return;

    let active = true;
    void signReceiptRefs(supabase, needed).then((resolved) => {
      if (active) setSigned((prev) => ({ ...prev, ...resolved }));
    });
    return () => {
      active = false;
    };
  }, [supabase, key]);

  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const ref of key ? key.split("\n") : []) {
      map[ref] = isDirectlyViewable(ref) ? ref : (signed[ref] ?? "");
    }
    return map;
  }, [key, signed]);
}
