"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface GroupSwitcherProps {
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
  groupName: string;
  onSwitchGroup: (id: string) => void;
}

export default function GroupSwitcher({
  groups,
  activeGroupId,
  groupName,
  onSwitchGroup,
}: GroupSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative", marginTop: 1 }}>
      {groups.length > 1 ? (
        <button
          onClick={() => setOpen((o) => !o)}
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
          {groupName}
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
          {groupName}
        </div>
      )}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
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
                  onClick={() => {
                    onSwitchGroup(g.id);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    background: isActive ? "rgba(0,122,255,0.1)" : "none",
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
                  {isActive && <span style={{ fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
