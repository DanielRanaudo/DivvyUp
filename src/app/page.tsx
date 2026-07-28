"use client";

import { Suspense, useEffect } from "react";
import { T } from "@/lib/tokens";
import { USE_BACKEND } from "@/lib/config";
import { identifyForErrors } from "@/lib/observability";
import { resolveTab, visibleTabs } from "@/lib/tabs";
import { stillOpen } from "@/lib/periods";
import { paymentsAwaiting } from "@/lib/payments";
import { myOpenChoreCount } from "@/lib/chores";
import { useAppRoute, type Screen } from "@/hooks/useAppRoute";
import { useGroupStore } from "@/hooks/useGroupStore";
import { useAuth } from "@/context/AuthProvider";

import AppShell from "@/components/AppShell";
import AuthScreen from "@/components/screens/AuthScreen";
import WelcomeScreen from "@/components/screens/WelcomeScreen";
import CreateGroupScreen from "@/components/screens/CreateGroupScreen";
import JoinGroupScreen from "@/components/screens/JoinGroupScreen";
import ProfileScreen from "@/components/screens/ProfileScreen";

/** Centred single line, for the loading and auth-gate states. */
function Centered({ children }: { children: React.ReactNode }) {
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
      <div style={{ color: T.secondary, fontSize: 15 }}>{children}</div>
    </div>
  );
}

export default function Page() {
  // useSearchParams needs a boundary it can suspend at while the query string
  // is read on the client.
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <DivvyUp />
    </Suspense>
  );
}

function DivvyUp() {
  const { session, loading: authLoading, signOut, updateEmail } = useAuth();
  const { params: route, navigate } = useAppRoute();
  const store = useGroupStore({
    session,
    route,
    navigate,
    signOut,
    updateEmail,
  });
  const {
    groups,
    group,
    currentUser,
    isTreasurer,
    myMemberIds,
    allCharges,
    saveError,
  } = store;

  // Ties error reports to an account without sending anything identifying.
  useEffect(() => {
    identifyForErrors(session?.user?.id ?? null);
  }, [session?.user?.id]);

  const showScreen = (next: Screen) => navigate({ screen: next });
  const openTab = (next: string) => navigate({ tab: next });

  const tabs = visibleTabs(isTreasurer, {
    expenses: stillOpen(group?.expenses).filter((e) => e.status === "pending")
      .length,
    payments: currentUser
      ? paymentsAwaiting(group?.payments, currentUser.id).length
      : 0,
    chores: currentUser
      ? myOpenChoreCount(group?.chores ?? [], currentUser.id)
      : 0,
  });
  const tab = resolveTab(tabs, route.tab);

  // "app" needs a group; the profile stands on its own.
  const screen: Screen = (() => {
    const wanted = route.screen ?? (group ? "app" : "welcome");
    return wanted === "app" && !group ? "welcome" : wanted;
  })();

  // The profile falls back to the signup metadata when no group is loaded.
  const authMeta = session?.user?.user_metadata ?? {};

  if (USE_BACKEND && authLoading) {
    return <Centered>Loading…</Centered>;
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

  if (USE_BACKEND && store.loading) {
    return <Centered>Loading…</Centered>;
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
          onClick={store.dismissSaveError}
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
          onStart={() => showScreen("create")}
          onJoin={() => showScreen("join")}
          onLogout={USE_BACKEND ? store.logout : undefined}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onEnterGroup={store.switchGroup}
          onLeaveGroup={store.leave}
        />
      )}

      {screen === "create" && (
        <CreateGroupScreen
          onBack={() => showScreen("welcome")}
          onCreate={async (name) => {
            const error = await store.create(name);
            if (error) alert(error);
          }}
        />
      )}

      {screen === "join" && (
        <JoinGroupScreen
          onBack={() => showScreen("welcome")}
          onJoin={store.joinLocally}
          onJoinCode={USE_BACKEND ? store.joinByCode : undefined}
          groups={groups}
        />
      )}

      {screen === "profile" && (
        <ProfileScreen
          name={currentUser?.name || (authMeta.name as string) || "You"}
          email={session?.user?.email}
          venmo={currentUser?.venmo || (authMeta.venmo as string) || ""}
          zelle={currentUser?.zelle || (authMeta.zelle as string) || ""}
          avatarUrl={currentUser?.avatarUrl}
          canEditEmail={USE_BACKEND}
          onSave={store.saveProfile}
          onUploadAvatar={store.uploadProfilePicture}
          groups={groups.map((g) => {
            const myId = myMemberIds[g.id] ?? currentUser?.id;
            return {
              id: g.id,
              name: g.name,
              memberCount: g.members.length,
              isTreasurer:
                g.members.find((m) => m.id === myId)?.isTreasurer ?? false,
            };
          })}
          activeGroupId={store.activeGroupId}
          onBack={() => showScreen(group ? "app" : "welcome")}
          onEnterGroup={store.switchGroup}
          onLeaveGroup={store.leave}
          onCreateGroup={() => showScreen("create")}
          onJoinGroup={() => showScreen("join")}
          onLogout={USE_BACKEND ? store.logout : undefined}
        />
      )}

      {screen === "app" && group && currentUser && (
        <AppShell
          group={group}
          groups={groups}
          currentUser={currentUser}
          isTreasurer={isTreasurer}
          tabs={tabs}
          tab={tab}
          allCharges={allCharges}
          setGroup={store.setGroup}
          onOpenTab={openTab}
          onSwitchGroup={store.switchGroup}
          onViewProfile={() => showScreen("profile")}
          onViewAs={store.viewAs}
          onCloseMonth={store.closeMonth}
        />
      )}
    </div>
  );
}
