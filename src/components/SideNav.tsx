"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import type { Tab } from "@/lib/types";
import GroupSwitcher from "@/components/GroupSwitcher";

interface SideNavProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  isSandbox: boolean;
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
  groupName: string;
  onSwitchGroup: (id: string) => void;
  onViewOtherGroups: () => void;
}

function Brand({ isSandbox }: { isSandbox: boolean }) {
  return (
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
      {isSandbox && (
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
  );
}

export default function SideNav({
  tabs,
  active,
  onChange,
  isSandbox,
  groups,
  activeGroupId,
  groupName,
  onSwitchGroup,
  onViewOtherGroups,
}: SideNavProps) {
  const [open, setOpen] = useState(false);

  const selectTab = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      {/* Mobile-only top bar with hamburger */}
      <div className="sidenav-topbar">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            border: "none",
            background: T.cardSolid,
            borderRadius: T.radiusSm,
            boxShadow: T.shadow,
            cursor: "pointer",
            fontSize: 18,
            color: T.text,
            flexShrink: 0,
          }}
        >
          ☰
        </button>
        <Brand isSandbox={isSandbox} />
      </div>

      {/* Backdrop (mobile drawer only) */}
      {open && (
        <div className="sidenav-overlay" onClick={() => setOpen(false)} />
      )}

      <nav
        className={`sidenav ${open ? "sidenav-open" : ""}`}
        style={{
          background: T.cardSolid,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          padding: "18px 14px",
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <Brand isSandbox={isSandbox} />
            <div style={{ marginTop: 2 }}>
              <GroupSwitcher
                groups={groups}
                activeGroupId={activeGroupId}
                groupName={groupName}
                onSwitchGroup={onSwitchGroup}
              />
            </div>
          </div>
          {/* Close button (mobile drawer only) */}
          <button
            type="button"
            aria-label="Close menu"
            className="sidenav-close"
            onClick={() => setOpen(false)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              color: T.secondary,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginTop: 20,
          }}
        >
          {tabs.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  background: isActive ? T.bg : "transparent",
                  fontFamily: T.font,
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? T.text : T.secondary,
                  borderRadius: T.radiusSm,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <span>{t.label}</span>
                {t.badge ? (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: T.red,
                      flexShrink: 0,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => {
            setOpen(false);
            onViewOtherGroups();
          }}
          style={{
            background: T.bg,
            border: "none",
            borderRadius: 20,
            padding: "9px 14px",
            fontSize: 13,
            color: T.secondary,
            cursor: "pointer",
            fontWeight: 500,
            fontFamily: T.font,
            marginTop: 12,
          }}
        >
          View other groups
        </button>
      </nav>
    </>
  );
}
