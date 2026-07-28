"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type Screen = "welcome" | "create" | "join" | "app" | "profile";

const SCREENS: Screen[] = ["welcome", "create", "join", "app", "profile"];

export interface RouteParams {
  screen: Screen | null;
  tab: string | null;
  groupId: string | null;
}

/** Passing null for a key removes it from the URL. */
export type RouteChange = Partial<RouteParams>;

export interface AppRoute {
  /** What the URL asks for. Callers decide whether it is reachable yet. */
  params: RouteParams;
  navigate: (change: RouteChange, options?: { replace?: boolean }) => void;
}

function parseScreen(value: string | null): Screen | null {
  return SCREENS.includes(value as Screen) ? (value as Screen) : null;
}

/**
 * Keeps which screen, group and tab you are looking at in the query string,
 * so the back button works and a link to a specific tab opens on that tab.
 *
 * The URL is the request, not the answer: it can name a group you have since
 * left or a tab only the treasurer can see, so the app validates it against
 * what is actually loaded before rendering.
 */
export function useAppRoute(): AppRoute {
  const router = useRouter();
  const search = useSearchParams();

  const params: RouteParams = {
    screen: parseScreen(search.get("screen")),
    tab: search.get("tab"),
    groupId: search.get("g"),
  };

  const navigate = useCallback(
    (change: RouteChange, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(search.toString());
      const set = (key: string, value: string | null | undefined) => {
        if (value === undefined) return;
        if (value === null) next.delete(key);
        else next.set(key, value);
      };
      set("screen", change.screen);
      set("tab", change.tab);
      set("g", change.groupId);

      const query = next.toString();
      const url = query ? `/?${query}` : "/";
      if (options?.replace) router.replace(url);
      else router.push(url);
    },
    [router, search]
  );

  return { params, navigate };
}
