"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";
import { uid, groupCode } from "@/lib/utils";
import { IS_SANDBOX, USE_BACKEND } from "@/lib/config";
import { useAuth } from "@/context/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMyGroups,
  fetchGroup,
  createGroup,
  joinGroup,
  persistGroupDiff,
} from "@/lib/api";
import { subgroupCharges } from "@/lib/charges";
import { todayISO, addDaysISO, myOpenChoreCount } from "@/lib/chores";
import type { Group, Member, Charge } from "@/lib/types";

import TabBar from "@/components/TabBar";
import UserSwitcher from "@/components/UserSwitcher";
import AuthScreen from "@/components/screens/AuthScreen";
import WelcomeScreen from "@/components/screens/WelcomeScreen";
import CreateGroupScreen from "@/components/screens/CreateGroupScreen";
import JoinGroupScreen from "@/components/screens/JoinGroupScreen";
import DashboardTab from "@/components/tabs/DashboardTab";
import RentTab from "@/components/tabs/RentTab";
import UtilitiesTab from "@/components/tabs/UtilitiesTab";
import ExpensesTab from "@/components/tabs/ExpensesTab";
import SettleTab from "@/components/tabs/SettleTab";
import SubgroupsTab from "@/components/tabs/SubgroupsTab";
import ChoresTab from "@/components/tabs/ChoresTab";
import MembersTab from "@/components/tabs/MembersTab";

export default function DivvyUp() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [supabase] = useState(() =>
    USE_BACKEND && typeof window !== "undefined" ? createClient() : null
  );
  const [screen, setScreen] = useState<"welcome" | "create" | "join" | "app">(
    "welcome"
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [myMemberIds, setMyMemberIds] = useState<Record<string, string>>({});
  const [dataLoading, setDataLoading] = useState(USE_BACKEND);
  const [tab, setTab] = useState("dashboard");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = groups.find((g) => g.id === activeGroupId) ?? null;
  const isTreasurer = currentUser?.isTreasurer || false;

  const showSaveError = (message: string) => {
    setSaveError(message);
    if (saveErrorTimer.current) clearTimeout(saveErrorTimer.current);
    saveErrorTimer.current = setTimeout(() => setSaveError(null), 6000);
  };

  const switchGroup = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    const memberId = myMemberIds[gid];
    const nextUser =
      (memberId && g.members.find((m) => m.id === memberId)) ||
      g.members.find((m) => m.id === currentUser?.id) ||
      g.members.find((m) => m.isTreasurer) ||
      g.members[0] ||
      null;
    setActiveGroupId(gid);
    setCurrentUser(nextUser);
    setTab("dashboard");
    setSwitcherOpen(false);
    setScreen("app");
  };

  // On save failure: tell the user and roll the group back to server state
  // (the optimistic update would otherwise show data that never persisted).
  const handleSaveFailure = async (groupId: string, errors: string[]) => {
    const message =
      errors.length > 1
        ? `${errors[0]} (+${errors.length - 1} more)`
        : errors[0];
    showSaveError(`Couldn't save — ${message}`);
    if (!supabase || !session) return;
    try {
      const loaded = await fetchGroup(supabase, groupId, session.user.id);
      if (loaded) {
        setGroups((cur) =>
          cur.map((g) => (g.id === groupId ? loaded.group : g))
        );
        setCurrentUser((cur) =>
          cur ? loaded.group.members.find((m) => m.id === cur.id) ?? cur : cur
        );
      }
    } catch (e) {
      console.error("Rollback refetch failed", e);
    }
  };

  const setGroup = (updater: (prev: Group) => Group) => {
    setGroups((prev) => {
      const next = prev.map((g) =>
        g.id === activeGroupId ? updater(g) : g
      );
      if (USE_BACKEND && supabase) {
        const before = prev.find((g) => g.id === activeGroupId);
        const after = next.find((g) => g.id === activeGroupId);
        if (before && after) {
          persistGroupDiff(supabase, before, after)
            .then((errors) => {
              if (errors.length) void handleSaveFailure(after.id, errors);
            })
            .catch(() => {
              void handleSaveFailure(after.id, [
                "Network error, changes may not be saved",
              ]);
            });
        }
      }
      return next;
    });
  };

  const enterLoadedGroup = (
    loadedGroup: Group,
    myMemberId: string
  ) => {
    setGroups((prev) => [
      ...prev.filter((g) => g.id !== loadedGroup.id),
      loadedGroup,
    ]);
    setMyMemberIds((prev) => ({ ...prev, [loadedGroup.id]: myMemberId }));
    setActiveGroupId(loadedGroup.id);
    setCurrentUser(
      loadedGroup.members.find((m) => m.id === myMemberId) ?? null
    );
    setScreen("app");
  };

  useEffect(() => {
    if (!USE_BACKEND || !supabase || !session) return;
    let active = true;
    // Deliberate: show the loading screen while (re)fetching groups after a
    // session change, e.g. logging back in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    fetchMyGroups(supabase, session.user.id)
      .then((loaded) => {
        if (!active) return;
        setGroups(loaded.map((l) => l.group));
        setMyMemberIds(
          Object.fromEntries(loaded.map((l) => [l.group.id, l.myMemberId]))
        );
        if (loaded.length > 0) {
          const first = loaded[0];
          setActiveGroupId(first.group.id);
          setCurrentUser(
            first.group.members.find((m) => m.id === first.myMemberId) ?? null
          );
          setScreen("app");
        } else {
          setScreen("welcome");
        }
      })
      .catch((e) => console.error("Failed to load groups", e))
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [supabase, session]);

  // Realtime: when anything in the active group changes on the server,
  // refetch it so every roommate stays in sync live.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!USE_BACKEND || !supabase || !session || !activeGroupId) return;
    const gid = activeGroupId;
    const myUserId = session.user.id;

    const refetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(async () => {
        try {
          const loaded = await fetchGroup(supabase, gid, myUserId);
          if (loaded) {
            setGroups((prev) =>
              prev.map((g) => (g.id === gid ? loaded.group : g))
            );
            setCurrentUser((cur) =>
              cur
                ? loaded.group.members.find((m) => m.id === cur.id) ?? cur
                : cur
            );
          } else {
            // Removed from the group (or it was deleted).
            setActiveGroupId(null);
            setCurrentUser(null);
            setScreen("welcome");
          }
        } catch (e) {
          console.error("Realtime refetch failed", e);
        }
      }, 250);
    };

    const tables = [
      "groups",
      "group_members",
      "rent",
      "utilities",
      "expenses",
      "payments",
    ];
    const channel = supabase.channel(`group-${gid}`);
    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: table === "groups" ? `id=eq.${gid}` : `group_id=eq.${gid}`,
        },
        refetch
      );
    });
    channel.subscribe();

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, session, activeGroupId]);

  const handleCreate = async (groupName: string) => {
    if (USE_BACKEND && supabase && session) {
      try {
        const gid = await createGroup(supabase, groupName);
        const loaded = await fetchGroup(supabase, gid, session.user.id);
        if (loaded) enterLoadedGroup(loaded.group, loaded.myMemberId);
      } catch (e) {
        alert((e as Error).message);
      }
      return;
    }

    const meta = session?.user?.user_metadata ?? {};
    const user: Member = {
      id: uid(),
      name: (meta.name as string)?.trim() || "You",
      venmo: (meta.venmo as string)?.trim() || "",
      isTreasurer: true,
    };
    const demoMembers: Member[] = IS_SANDBOX
      ? [
          { id: uid(), name: "Alex", venmo: "@alex-v", isTreasurer: false },
          { id: uid(), name: "Jordan", venmo: "@jordanp", isTreasurer: false },
          { id: uid(), name: "Sam", venmo: "@samwise", isTreasurer: false },
          { id: uid(), name: "Riley", venmo: "", isTreasurer: false },
          { id: uid(), name: "Casey", venmo: "@caseyg", isTreasurer: false },
          { id: uid(), name: "Morgan", venmo: "", isTreasurer: false },
          { id: uid(), name: "Taylor", venmo: "@taylork", isTreasurer: false },
          { id: uid(), name: "Jamie", venmo: "@jamiej", isTreasurer: false },
          { id: uid(), name: "Quinn", venmo: "@quinnr", isTreasurer: false },
        ]
      : [];
    const demoChores: Group["chores"] = IS_SANDBOX
      ? [
          {
            id: uid(),
            name: "Take out trash",
            icon: "🗑️",
            everyDays: 2,
            nextDue: todayISO(),
            assignMode: "rotation",
            assigneeId: user.id,
            rotationIds: [user.id, demoMembers[0].id, demoMembers[1].id],
            rotationIndex: 0,
            history: [],
          },
          {
            id: uid(),
            name: "Wash the dishes",
            icon: "🍽️",
            everyDays: 1,
            nextDue: addDaysISO(todayISO(), 1),
            assignMode: "fixed",
            assigneeId: demoMembers[2].id,
            rotationIds: [],
            rotationIndex: 0,
            history: [],
          },
        ]
      : [];
    const g: Group = {
      id: uid(),
      name: groupName,
      code: groupCode(),
      members: [user, ...demoMembers],
      rent: null,
      utilities: [],
      expenses: [],
      payments: [],
      subgroups: [],
      chores: demoChores,
      smartSettle: false,
    };
    setGroups((prev) => [...prev, g]);
    setActiveGroupId(g.id);
    setCurrentUser(user);
    setScreen("app");
  };

  const handleJoin = (groupId: string, userName: string, venmo: string) => {
    const user: Member = {
      id: uid(),
      name: userName,
      venmo,
      isTreasurer: false,
    };
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, members: [...g.members, user] } : g
      )
    );
    setActiveGroupId(groupId);
    setCurrentUser(user);
    setScreen("app");
  };

  // Real backend join: look up by invite code via the join_group RPC.
  // Returns an error message on failure, or null on success.
  const handleJoinCode = async (
    code: string,
    userName: string,
    venmo: string
  ): Promise<string | null> => {
    if (!(USE_BACKEND && supabase && session)) return "Backend not available";
    try {
      const gid = await joinGroup(supabase, code, userName, venmo);
      const loaded = await fetchGroup(supabase, gid, session.user.id);
      if (loaded) enterLoadedGroup(loaded.group, loaded.myMemberId);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const allCharges = useMemo<Charge[]>(() => {
    if (!group) return [];
    const charges: Charge[] = [];
    const treasurer = group.members.find((m) => m.isTreasurer);
    const treasurerId = treasurer?.id;
    if (group.rent?.splits)
      charges.push({
        id: group.rent.id,
        type: "rent",
        description: "Rent",
        amount: group.rent.amount,
        splits: group.rent.splits,
        recurring: group.rent.recurring,
        paidBy: treasurerId,
      });
    group.utilities.forEach((u) =>
      charges.push({
        id: u.id,
        type: "utility",
        description: u.name,
        amount: u.amount,
        splits: u.splits,
        recurring: u.recurring,
        paidBy: treasurerId,
      })
    );
    group.expenses
      .filter((e) => e.status === "approved")
      .forEach((e) =>
        charges.push({
          id: e.id,
          type: "expense",
          description: e.description,
          amount: e.amount,
          splits: e.splits!,
          submittedByName: e.submittedByName,
          paidBy: e.submittedBy,
          recurring: false,
        })
      );
    charges.push(...subgroupCharges(group.subgroups ?? []));
    return charges;
  }, [group]);

  const pendingExpenses =
    group?.expenses.filter((e) => e.status === "pending").length || 0;
  const pendingPayments = currentUser
    ? (group?.payments || []).filter(
        (p) => p.toId === currentUser.id && p.status === "pending"
      ).length
    : 0;
  const myChores = currentUser
    ? myOpenChoreCount(group?.chores ?? [], currentUser.id)
    : 0;

  const treasurerTabs = [
    { id: "dashboard", label: "Home", badge: pendingPayments || null },
    { id: "rent", label: "Rent" },
    { id: "utilities", label: "Bills" },
    {
      id: "expenses",
      label: "Expenses",
      badge: pendingExpenses || null,
    },
    { id: "subgroups", label: "Floors" },
    { id: "chores", label: "Chores", badge: myChores || null },
    { id: "settle", label: "Settle" },
    { id: "members", label: "Group" },
  ];
  const memberTabs = [
    { id: "dashboard", label: "Home", badge: pendingPayments || null },
    {
      id: "expenses",
      label: "Expenses",
      badge: pendingExpenses || null,
    },
    { id: "subgroups", label: "Floors" },
    { id: "chores", label: "Chores", badge: myChores || null },
    { id: "settle", label: "Settle" },
    { id: "members", label: "Group" },
  ];

  const handleLogout = async () => {
    await signOut();
    setGroups([]);
    setActiveGroupId(null);
    setCurrentUser(null);
    setTab("dashboard");
    setScreen("welcome");
  };

  if (USE_BACKEND && authLoading) {
    return (
      <div
        style={{
          fontFamily: T.font,
          color: T.text,
          background: T.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: T.secondary, fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  if (USE_BACKEND && !session) {
    return (
      <div
        style={{
          fontFamily: T.font,
          color: T.text,
          background: T.bg,
          minHeight: "100vh",
        }}
      >
        <AuthScreen />
      </div>
    );
  }

  if (USE_BACKEND && dataLoading) {
    return (
      <div
        style={{
          fontFamily: T.font,
          color: T.text,
          background: T.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: T.secondary, fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: T.font,
        color: T.text,
        background: T.bg,
        minHeight: "100vh",
      }}
    >
      {saveError && (
        <div
          role="alert"
          onClick={() => setSaveError(null)}
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            maxWidth: 420,
            width: "calc(100% - 40px)",
            background: T.red,
            color: "#fff",
            borderRadius: T.radiusSm,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 500,
            boxShadow: T.shadowLg,
            cursor: "pointer",
          }}
        >
          {saveError}
        </div>
      )}
      {screen === "welcome" && (
        <WelcomeScreen
          onStart={() => setScreen("create")}
          onJoin={() => setScreen("join")}
          onLogout={USE_BACKEND ? handleLogout : undefined}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onEnterGroup={switchGroup}
        />
      )}
      {screen === "create" && (
        <CreateGroupScreen
          onBack={() => setScreen("welcome")}
          onCreate={handleCreate}
        />
      )}
      {screen === "join" && (
        <JoinGroupScreen
          onBack={() => setScreen("welcome")}
          onJoin={handleJoin}
          onJoinCode={USE_BACKEND ? handleJoinCode : undefined}
          groups={groups}
        />
      )}

      {screen === "app" && group && currentUser && (
        <div
          style={{
            maxWidth: tab === "dashboard" ? 900 : 560,
            margin: "0 auto",
            padding: "12px 20px",
            paddingBottom: 80,
          }}
        >
          <div
            style={{
              padding: "12px 0 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  divvyup
                </h1>
                {IS_SANDBOX && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "#fff",
                      background: T.red,
                      borderRadius: 6,
                      padding: "2px 6px",
                      textTransform: "uppercase",
                    }}
                  >
                    Sandbox
                  </span>
                )}
              </div>
              <div style={{ position: "relative", marginTop: 1 }}>
                {groups.length > 1 ? (
                  <button
                    onClick={() => setSwitcherOpen((o) => !o)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: 13,
                      color: T.tertiary,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: T.font,
                    }}
                  >
                    {group.name}
                    <span style={{ fontSize: 10 }}>▾</span>
                  </button>
                ) : (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.tertiary,
                      fontWeight: 500,
                    }}
                  >
                    {group.name}
                  </div>
                )}
                {switcherOpen && (
                  <>
                    <div
                      onClick={() => setSwitcherOpen(false)}
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 40,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        minWidth: 200,
                        background: T.cardSolid,
                        borderRadius: T.radiusSm,
                        boxShadow: T.shadowLg,
                        padding: 6,
                        zIndex: 41,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: T.tertiary,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          padding: "6px 10px 4px",
                        }}
                      >
                        Your groups
                      </div>
                      {groups.map((g) => {
                        const isActive = g.id === activeGroupId;
                        return (
                          <button
                            key={g.id}
                            onClick={() => switchGroup(g.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              width: "100%",
                              textAlign: "left",
                              background: isActive
                                ? "rgba(0,122,255,0.1)"
                                : "none",
                              border: "none",
                              borderRadius: 8,
                              padding: "9px 10px",
                              fontSize: 14,
                              fontWeight: 500,
                              color: isActive ? T.blue : T.text,
                              cursor: "pointer",
                              fontFamily: T.font,
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {g.name}
                            </span>
                            {isActive && (
                              <span style={{ fontSize: 12 }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setScreen("welcome");
                setActiveGroupId(null);
                setCurrentUser(null);
                setTab("dashboard");
              }}
              style={{
                background: T.bg,
                border: "none",
                borderRadius: 20,
                padding: "7px 14px",
                fontSize: 13,
                color: T.secondary,
                cursor: "pointer",
                fontWeight: 500,
                fontFamily: T.font,
              }}
            >
              Leave
            </button>
          </div>

          <TabBar
            tabs={isTreasurer ? treasurerTabs : memberTabs}
            active={tab}
            onChange={setTab}
          />

          {tab === "dashboard" && (
            <DashboardTab
              group={group}
              currentUser={currentUser}
              allCharges={allCharges}
              setGroup={setGroup}
              setTab={setTab}
            />
          )}
          {tab === "rent" && isTreasurer && (
            <RentTab group={group} setGroup={setGroup} />
          )}
          {tab === "utilities" && isTreasurer && (
            <UtilitiesTab group={group} setGroup={setGroup} />
          )}
          {tab === "expenses" && (
            <ExpensesTab
              group={group}
              setGroup={setGroup}
              currentUser={currentUser}
              isTreasurer={isTreasurer}
            />
          )}
          {tab === "subgroups" && (
            <SubgroupsTab
              group={group}
              setGroup={setGroup}
              currentUser={currentUser}
            />
          )}
          {tab === "chores" && (
            <ChoresTab
              group={group}
              setGroup={setGroup}
              currentUser={currentUser}
            />
          )}
          {tab === "settle" && (
            <SettleTab
              group={group}
              setGroup={setGroup}
              allCharges={allCharges}
              currentUser={currentUser}
            />
          )}
          {tab === "members" && (
            <MembersTab
              group={group}
              setGroup={setGroup}
              currentUser={currentUser}
              isTreasurer={isTreasurer}
              allCharges={allCharges}
            />
          )}

          {IS_SANDBOX && (
            <UserSwitcher
              group={group}
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
            />
          )}
        </div>
      )}
    </div>
  );
}
