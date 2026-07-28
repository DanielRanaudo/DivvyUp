"use client";

import { T } from "@/lib/tokens";
import { IS_SANDBOX } from "@/lib/config";
import type { Charge, Group, Member, Tab } from "@/lib/types";
import TabBar from "@/components/TabBar";
import MobileNav from "@/components/MobileNav";
import GroupSwitcher from "@/components/GroupSwitcher";
import UserSwitcher from "@/components/UserSwitcher";
import DashboardTab from "@/components/tabs/DashboardTab";
import RentTab from "@/components/tabs/RentTab";
import UtilitiesTab from "@/components/tabs/UtilitiesTab";
import ExpensesTab from "@/components/tabs/ExpensesTab";
import SettleTab from "@/components/tabs/SettleTab";
import SubgroupsTab from "@/components/tabs/SubgroupsTab";
import ChoresTab from "@/components/tabs/ChoresTab";
import MembersTab from "@/components/tabs/MembersTab";

interface AppShellProps {
  group: Group;
  groups: Group[];
  currentUser: Member;
  isTreasurer: boolean;
  tabs: Tab[];
  tab: string;
  allCharges: Charge[];
  setGroup: (updater: (prev: Group) => Group) => void;
  onOpenTab: (id: string) => void;
  onSwitchGroup: (id: string) => void;
  onViewProfile: () => void;
  onViewAs: (memberId: string) => void;
  onCloseMonth: () => Promise<string | null>;
}

/** The header, the navigation, and whichever tab is open. */
export default function AppShell({
  group,
  groups,
  currentUser,
  isTreasurer,
  tabs,
  tab,
  allCharges,
  setGroup,
  onOpenTab,
  onSwitchGroup,
  onViewProfile,
  onViewAs,
  onCloseMonth,
}: AppShellProps) {
  return (
    <div
      style={{
        maxWidth: 900,
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MobileNav
            tabs={tabs}
            active={tab}
            onChange={onOpenTab}
            groupName={group.name}
            onViewProfile={onViewProfile}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <GroupSwitcher
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
              activeGroupId={group.id}
              groupName={group.name}
              onSwitchGroup={onSwitchGroup}
            />
          </div>
        </div>
        <button
          onClick={onViewProfile}
          className="nav-view-groups"
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
          View profile
        </button>
      </div>

      <TabBar
        className="nav-desktop-tabs"
        tabs={tabs}
        active={tab}
        onChange={onOpenTab}
      />

      <div
        style={{
          // The dashboard and the chore board are two columns on a wide
          // screen; the rest read better as a single narrow one.
          maxWidth: tab === "dashboard" || tab === "chores" ? "none" : 560,
          margin: "0 auto",
        }}
      >
        {tab === "dashboard" && (
          <DashboardTab
            group={group}
            currentUser={currentUser}
            allCharges={allCharges}
            setGroup={setGroup}
            setTab={onOpenTab}
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
            isTreasurer={isTreasurer}
            onCloseMonth={onCloseMonth}
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
      </div>

      {IS_SANDBOX && (
        <UserSwitcher
          group={group}
          currentUser={currentUser}
          setCurrentUser={(m) => onViewAs(m.id)}
        />
      )}
    </div>
  );
}
