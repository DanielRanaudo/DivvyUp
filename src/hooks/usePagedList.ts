"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "@/lib/types";

/** Asks for the rows starting at `offset`. */
export type PageSource<T> = (offset: number, limit: number) => Promise<Page<T>>;

export interface PagedList<T> {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * A list that grows a page at a time.
 *
 * `resetKey` identifies what is being listed — change it (a different month,
 * say) and the list starts again from the first page.
 */
export function usePagedList<T>(
  source: PageSource<T>,
  resetKey: string,
  pageSize = 10
): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in refs so loading a page doesn't depend on the render that asked.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const offset = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (from: number, replace: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const page = await sourceRef.current(from, pageSize);
        offset.current = from + page.items.length;
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
        setHasMore(page.hasMore);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    offset.current = 0;
    setItems([]);
    setHasMore(false);
    void load(0, true);
  }, [resetKey, load]);

  const loadMore = useCallback(() => {
    void load(offset.current, false);
  }, [load]);

  return { items, hasMore, loading, error, loadMore };
}
