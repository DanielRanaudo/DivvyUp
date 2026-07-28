"use client";

import { useCallback, useState } from "react";
import { T } from "@/lib/tokens";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Tab } from "@/lib/types";

interface MobileNavProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  groupName: string;
  onViewProfile: () => void;
}

export default function MobileNav({
  tabs,
  active,
  onChange,
  groupName,
  onViewProfile,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const drawerRef = useFocusTrap<HTMLElement>(open, close);

  const selectTab = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="nav-hamburger"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen(true)}
        style={{
          width: 38,
          height: 38,
          flexShrink: 0,
          border: "none",
          background: T.cardSolid,
          borderRadius: T.radiusSm,
          boxShadow: T.shadow,
          cursor: "pointer",
          fontSize: 17,
          lineHeight: 1,
          color: T.text,
        }}
      >
        ☰
      </button>

      {open && (
        <div
          aria-hidden="true"
          className="nav-drawer-overlay"
          onClick={close}
        />
      )}

      {/* The drawer stays mounted so it can slide; `inert` is what keeps its
          buttons out of the tab order and the accessibility tree while it is
          off-screen. */}
      <nav
        ref={drawerRef}
        id="mobile-nav-drawer"
        aria-label="Main navigation"
        inert={!open}
        className={`nav-drawer ${open ? "nav-drawer-open" : ""}`}
        style={{
          background: T.cardSolid,
          display: "flex",
          flexDirection: "column",
          padding: "20px 14px",
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              divvyup
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.tertiary,
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              {groupName}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: T.secondary,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {tabs.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 12px",
                  border: "none",
                  background: isActive ? T.bg : "transparent",
                  fontFamily: T.font,
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? T.text : T.secondary,
                  borderRadius: T.radiusSm,
                  cursor: "pointer",
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
            close();
            onViewProfile();
          }}
          style={{
            background: T.bg,
            border: "none",
            borderRadius: 20,
            padding: "10px 14px",
            fontSize: 13,
            color: T.secondary,
            cursor: "pointer",
            fontWeight: 500,
            fontFamily: T.font,
            marginTop: 16,
          }}
        >
          View profile
        </button>
      </nav>
    </>
  );
}
