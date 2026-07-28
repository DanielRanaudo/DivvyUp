"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { USE_BACKEND } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { reportError } from "@/lib/observability";
import {
  fetchMyGroups,
  fetchGroup,
  createGroup as createGroupOnServer,
  joinGroup as joinGroupOnServer,
  leaveGroup as leaveGroupOnServer,
  persistGroupDiff,
  updateMyProfile,
  closePeriod as closePeriodOnServer,
} from "@/lib/api";
import { uploadAvatar, AVATAR_MAX_DIM } from "@/lib/avatars";
import { fileToCompressedBlob, fileToCompressedDataURL } from "@/lib/image";
import { buildCharges } from "@/lib/charges";
import { closePeriod, periodKey } from "@/lib/periods";
import { localGroup } from "@/lib/sandbox";
import { uid, withTimeout } from "@/lib/utils";
import type {
  Charge,
  Group,
  Member,
  ProfileEdits,
  ProfileSaveResult,
} from "@/lib/types";
import type { RouteParams } from "@/hooks/useAppRoute";
import { useGroupRealtime } from "@/hooks/useGroupRealtime";

type Navigate = (
  next: Partial<RouteParams>,
  options?: { replace?: boolean }
) => void;

interface GroupStoreOptions {
  session: Session | null;
  route: RouteParams;
  navigate: Navigate;
  signOut: () => Promise<void>;
  updateEmail: (email: string) => Promise<{ error: string | null }>;
}

const SAVE_ERROR_MS = 6000;
const LOAD_TIMEOUT_MS = 15000;

/**
 * Everything the app knows about the current household, and every way it can
 * change.
 *
 * Group state is held in React and written through to Supabase as a diff, so
 * the screen updates immediately and the database catches up. That makes three
 * things this hook has to get right, and they are why it exists as one piece
 * rather than several: a failed write has to roll the screen back to what was
 * actually saved, concurrent writes have to be serialised, and a roommate's
 * change arriving over realtime must not overwrite an edit of ours that is
 * still in flight.
 */
export function useGroupStore({
  session,
  route,
  navigate,
  signOut,
  updateEmail,
}: GroupStoreOptions) {
  const [supabase] = useState(() =>
    USE_BACKEND && typeof window !== "undefined" ? createClient() : null
  );
  const [groups, setGroups] = useState<Group[]>([]);
  // Mirrors `groups`, so an edit can be built from the latest value without
  // waiting for a re-render. Every change goes through applyGroups, which keeps
  // the two in step.
  const groupsRef = useRef<Group[]>([]);
  const [myMemberIds, setMyMemberIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(USE_BACKEND);
  // Sandbox only: which roommate the demo is being viewed as.
  const [viewingAs, setViewingAs] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts persist batches still in flight. The realtime subscription checks
  // this before replacing local state, so a roommate's change can't overwrite
  // an edit of ours that hasn't finished saving yet.
  const pendingWrites = useRef(0);

  // The URL names a group; falling back to the first one keeps a bare "/"
  // working, and drops a link to a group you've left back to something valid.
  const activeGroupId =
    (route.groupId && groups.some((g) => g.id === route.groupId)
      ? route.groupId
      : groups[0]?.id) ?? null;
  const group = groups.find((g) => g.id === activeGroupId) ?? null;

  // Whose eyes we're looking through. Derived from the group rather than held
  // separately, so an edit to a member is reflected without a second update.
  const currentUser = useMemo<Member | null>(() => {
    if (!group) return null;
    const byId = (id: string | null | undefined) =>
      id ? group.members.find((m) => m.id === id) : undefined;
    return (
      byId(viewingAs) ??
      byId(myMemberIds[group.id]) ??
      group.members.find((m) => m.isTreasurer) ??
      group.members[0] ??
      null
    );
  }, [group, viewingAs, myMemberIds]);

  const allCharges = useMemo<Charge[]>(
    () => (group ? buildCharges(group) : []),
    [group]
  );

  /**
   * The one way group state changes.
   *
   * The next value is computed here rather than inside a state updater: React
   * is free to call an updater more than once for a single change (and does in
   * development), so anything with a consequence beyond the return value —
   * a request, or an id minted on the way in — cannot live in one.
   */
  const applyGroups = useCallback((updater: (prev: Group[]) => Group[]) => {
    const next = updater(groupsRef.current);
    groupsRef.current = next;
    setGroups(next);
  }, []);

  const showSaveError = useCallback((message: string) => {
    setSaveError(message);
    if (saveErrorTimer.current) clearTimeout(saveErrorTimer.current);
    saveErrorTimer.current = setTimeout(
      () => setSaveError(null),
      SAVE_ERROR_MS
    );
  }, []);

  // Replaces a group with whatever the server currently holds. Used both to
  // roll back a failed optimistic update and to recover from a lost edit race.
  const reloadGroup = useCallback(
    async (groupId: string) => {
      if (!supabase || !session) return;
      const loaded = await fetchGroup(supabase, groupId, session.user.id);
      if (!loaded) return;
      applyGroups((cur) =>
        cur.map((g) => (g.id === groupId ? loaded.group : g))
      );
    },
    [supabase, session, applyGroups]
  );

  // On save failure: tell the user and roll the group back to server state
  // (the optimistic update would otherwise show data that never persisted).
  const handleSaveFailure = useCallback(
    async (groupId: string, errors: string[], conflict?: boolean) => {
      const message =
        errors.length > 1
          ? `${errors[0]} (+${errors.length - 1} more)`
          : errors[0];
      showSaveError(
        conflict
          ? "A roommate changed this first — reloaded their version, please redo your edit"
          : `Couldn't save — ${message}`
      );
      try {
        await reloadGroup(groupId);
      } catch (e) {
        reportError("Rollback refetch failed", e, { groupId });
      }
    },
    [reloadGroup, showSaveError]
  );

  const { refetchNow } = useGroupRealtime({
    supabase,
    userId: session?.user?.id ?? null,
    groupId: activeGroupId,
    onGroup: useCallback(
      (loaded: Group) =>
        applyGroups((prev) =>
          prev.map((g) => (g.id === loaded.id ? loaded : g))
        ),
      [applyGroups]
    ),
    // Removed from the group (or it was deleted). Dropping it is enough: the
    // URL names a group that is no longer loaded, and both the selection and
    // the screen fall back on their own.
    onGone: useCallback(
      () => applyGroups((prev) => prev.filter((g) => g.id !== activeGroupId)),
      [activeGroupId, applyGroups]
    ),
    isBusy: useCallback(() => pendingWrites.current > 0, []),
  });
  // setGroup runs before this is assigned on the first render, so it reads the
  // callback through a ref rather than closing over it.
  const refetchDeferred = useRef(refetchNow);
  refetchDeferred.current = refetchNow;

  const setGroup = useCallback(
    (updater: (prev: Group) => Group) => {
      const before = groupsRef.current.find((g) => g.id === activeGroupId);
      if (!before) return;
      const after = updater(before);

      applyGroups((prev) =>
        prev.map((g) => (g.id === activeGroupId ? after : g))
      );
      if (!USE_BACKEND || !supabase) return;

      pendingWrites.current += 1;
      persistGroupDiff(supabase, before, after)
        .then((result) => {
          if (result.errors.length) {
            void handleSaveFailure(after.id, result.errors, result.conflict);
            return;
          }
          // Catch our local copy up to the version the server now holds,
          // otherwise the next edit to these documents looks stale.
          if (result.docsVersion !== undefined) {
            const version = result.docsVersion;
            applyGroups((cur) =>
              cur.map((g) =>
                g.id === after.id ? { ...g, docsVersion: version } : g
              )
            );
          }
        })
        .catch(() => {
          void handleSaveFailure(after.id, [
            "Network error, changes may not be saved",
          ]);
        })
        .finally(() => {
          pendingWrites.current -= 1;
          // Let through any refetch that arrived while this was saving.
          if (pendingWrites.current === 0) refetchDeferred.current();
        });
    },
    [activeGroupId, supabase, handleSaveFailure, applyGroups]
  );

  const enterLoadedGroup = useCallback(
    (loadedGroup: Group, myMemberId: string) => {
      applyGroups((prev) => [
        ...prev.filter((g) => g.id !== loadedGroup.id),
        loadedGroup,
      ]);
      setMyMemberIds((prev) => ({ ...prev, [loadedGroup.id]: myMemberId }));
      setViewingAs(null);
      navigate({ groupId: loadedGroup.id, screen: "app", tab: "dashboard" });
    },
    [navigate, applyGroups]
  );

  useEffect(() => {
    if (!USE_BACKEND || !supabase || !session) return;
    let active = true;
    // Deliberate: show the loading screen while (re)fetching groups after a
    // session change, e.g. logging back in.
    setLoading(true);
    // Which group is showing comes from the URL, so a refetch (after a token
    // refresh, say) can't yank the treasurer away from what they were doing.
    withTimeout(
      fetchMyGroups(supabase, session.user.id),
      LOAD_TIMEOUT_MS,
      "Couldn't reach the server. Check your connection and reload."
    )
      .then((loaded) => {
        if (!active) return;
        applyGroups(() => loaded.map((l) => l.group));
        setMyMemberIds(
          Object.fromEntries(loaded.map((l) => [l.group.id, l.myMemberId]))
        );
      })
      .catch((e) => {
        reportError("Failed to load groups", e);
        if (!active) return;
        // Without this the screen would fall through to the welcome state, which
        // reads as "you have no groups" rather than "we couldn't load them".
        showSaveError(
          e instanceof Error ? e.message : "Couldn't load your groups."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Keyed on the user id (not the whole session object) so a token refresh
    // doesn't trigger a full reload that would reset the active group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session?.user?.id, showSaveError]);

  const switchGroup = useCallback(
    (gid: string) => {
      if (!groups.some((g) => g.id === gid)) return;
      setViewingAs(null);
      navigate({ groupId: gid, screen: "app", tab: "dashboard" });
    },
    [groups, navigate]
  );

  const create = useCallback(
    async (groupName: string): Promise<string | null> => {
      if (USE_BACKEND && supabase && session) {
        try {
          const gid = await createGroupOnServer(supabase, groupName);
          const loaded = await fetchGroup(supabase, gid, session.user.id);
          if (loaded) enterLoadedGroup(loaded.group, loaded.myMemberId);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      }

      const meta = session?.user?.user_metadata ?? {};
      const you: Member = {
        id: uid(),
        name: (meta.name as string)?.trim() || "You",
        venmo: (meta.venmo as string)?.trim() || "",
        zelle: (meta.zelle as string)?.trim() || "",
        isTreasurer: true,
      };
      const g = localGroup(groupName, you);
      applyGroups((prev) => [...prev, g]);
      setMyMemberIds((prev) => ({ ...prev, [g.id]: you.id }));
      setViewingAs(null);
      navigate({ groupId: g.id, screen: "app", tab: "dashboard" });
      return null;
    },
    [supabase, session, enterLoadedGroup, navigate, applyGroups]
  );

  /** Demo-mode join: the group is already in memory. */
  const joinLocally = useCallback(
    (groupId: string, userName: string, venmo: string) => {
      const you: Member = {
        id: uid(),
        name: userName,
        venmo,
        zelle: "",
        isTreasurer: false,
      };
      applyGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, members: [...g.members, you] } : g
        )
      );
      setMyMemberIds((prev) => ({ ...prev, [groupId]: you.id }));
      setViewingAs(null);
      navigate({ groupId, screen: "app", tab: "dashboard" });
    },
    [navigate, applyGroups]
  );

  /** Returns an error message on failure, or null on success. */
  const joinByCode = useCallback(
    async (
      code: string,
      userName: string,
      venmo: string
    ): Promise<string | null> => {
      if (!(USE_BACKEND && supabase && session)) return "Backend not available";
      try {
        const gid = await joinGroupOnServer(supabase, code, userName, venmo);
        const loaded = await fetchGroup(supabase, gid, session.user.id);
        if (loaded) enterLoadedGroup(loaded.group, loaded.myMemberId);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [supabase, session, enterLoadedGroup]
  );

  const leave = useCallback(
    async (gid: string) => {
      const g = groups.find((x) => x.id === gid);
      if (!g) return;
      if (
        !window.confirm(
          `Leave "${g.name}"? You'll need an invite code to rejoin.`
        )
      ) {
        return;
      }

      if (USE_BACKEND && supabase) {
        const memberId = myMemberIds[gid];
        if (!memberId) {
          showSaveError("Couldn't leave — membership not found");
          return;
        }
        try {
          await leaveGroupOnServer(supabase, memberId);
        } catch (e) {
          showSaveError(`Couldn't leave — ${(e as Error).message}`);
          return;
        }
      }

      applyGroups((prev) => prev.filter((x) => x.id !== gid));
      setMyMemberIds((prev) => {
        const next = { ...prev };
        delete next[gid];
        return next;
      });
      if (activeGroupId === gid) {
        setViewingAs(null);
        navigate({ groupId: null, screen: null, tab: null }, { replace: true });
      }
    },
    [
      groups,
      supabase,
      myMemberIds,
      activeGroupId,
      navigate,
      showSaveError,
      applyGroups,
    ]
  );

  const uploadProfilePicture = useCallback(
    async (file: File): Promise<string> => {
      // Backend mode stores the file and keeps only its URL; sandbox mode has
      // no storage, so the picture lives in memory as a compressed data URL.
      if (USE_BACKEND && supabase && session) {
        const blob = await fileToCompressedBlob(file, AVATAR_MAX_DIM);
        return uploadAvatar(supabase, session.user.id, blob);
      }
      return fileToCompressedDataURL(file, AVATAR_MAX_DIM);
    },
    [supabase, session]
  );

  const saveProfile = useCallback(
    async (edits: ProfileEdits): Promise<ProfileSaveResult> => {
      // currentUser is derived from the group, so updating the member rows is
      // enough to update the header, the settle list and everything else.
      const applyLocally = () => {
        applyGroups((prev) =>
          prev.map((g) => ({
            ...g,
            members: g.members.map((m) =>
              m.id === (myMemberIds[g.id] ?? currentUser?.id)
                ? {
                    ...m,
                    venmo: edits.venmo,
                    zelle: edits.zelle,
                    avatarUrl: edits.avatarUrl,
                  }
                : m
            ),
          }))
        );
      };

      if (!(USE_BACKEND && supabase && session)) {
        applyLocally();
        return { error: null };
      }

      try {
        await updateMyProfile(supabase, session.user.id, {
          name: currentUser?.name,
          venmo: edits.venmo,
          zelle: edits.zelle,
          avatarUrl: edits.avatarUrl,
        });
      } catch (e) {
        return {
          error: `Couldn't save your profile — ${(e as Error).message}`,
        };
      }

      applyLocally();

      if (edits.email) {
        const { error } = await updateEmail(edits.email);
        if (error) return { error: `Couldn't change your email — ${error}` };
        return {
          notice:
            "Profile updated. Check your new inbox for a link to confirm the email change.",
          error: null,
        };
      }

      return { error: null };
    },
    [supabase, session, myMemberIds, currentUser, updateEmail, applyGroups]
  );

  /**
   * Closes the current month. The database does the archiving in one
   * transaction; the same pure transform is then applied locally so the screen
   * agrees with it without a full refetch.
   */
  const closeMonth = useCallback(async (): Promise<string | null> => {
    if (!group) return "There's no group open.";
    const at = new Date();
    if ((group.periods ?? []).some((p) => p.period === periodKey(at))) {
      return "This month has already been closed.";
    }

    const { period } = closePeriod(group, allCharges, at);
    if (USE_BACKEND && supabase) {
      try {
        await closePeriodOnServer(
          supabase,
          group.id,
          period.period,
          period.carryover,
          period.totals
        );
      } catch (e) {
        return `Couldn't close the month — ${(e as Error).message}`;
      }
    }
    setGroup((prev) => closePeriod(prev, allCharges, at).group);
    return null;
  }, [group, allCharges, supabase, setGroup]);

  const logout = useCallback(async () => {
    await signOut();
    applyGroups(() => []);
    setMyMemberIds({});
    setViewingAs(null);
    navigate({ groupId: null, screen: null, tab: null }, { replace: true });
  }, [signOut, navigate, applyGroups]);

  return {
    groups,
    group,
    activeGroupId,
    currentUser,
    isTreasurer: currentUser?.isTreasurer ?? false,
    myMemberIds,
    allCharges,
    loading,
    saveError,
    dismissSaveError: useCallback(() => setSaveError(null), []),
    setGroup,
    viewAs: useCallback((memberId: string) => setViewingAs(memberId), []),
    switchGroup,
    create,
    joinLocally,
    joinByCode,
    leave,
    uploadProfilePicture,
    saveProfile,
    closeMonth,
    logout,
  };
}
