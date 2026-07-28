"use client";

import { T, cardStyle } from "@/lib/tokens";
import { rowLabel } from "@/components/profile/styles";

export interface ProfileGroup {
  id: string;
  name: string;
  memberCount: number;
  isTreasurer: boolean;
}

interface GroupListProps {
  groups: ProfileGroup[];
  activeGroupId: string | null;
  onEnterGroup: (id: string) => void;
  onLeaveGroup: (id: string) => void;
}

/** Every house you're in, with a way into and out of each. */
export default function GroupList({
  groups,
  activeGroupId,
  onEnterGroup,
  onLeaveGroup,
}: GroupListProps) {
  if (groups.length === 0) {
    return (
      <div
        style={{
          ...cardStyle,
          color: T.secondary,
          fontSize: 14,
          textAlign: "center",
        }}
      >
        You&apos;re not in any groups yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map((g) => (
        <div
          key={g.id}
          style={{
            display: "flex",
            alignItems: "stretch",
            borderRadius: T.radius,
            background: T.cardSolid,
            boxShadow: T.shadow,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => onEnterGroup(g.id)}
            aria-current={g.id === activeGroupId ? "true" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flex: 1,
              minWidth: 0,
              padding: "13px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: T.font,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  color: T.text,
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
                {g.id === activeGroupId && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: T.blue,
                      background: "rgba(0,122,255,0.1)",
                      borderRadius: 5,
                      padding: "2px 5px",
                      flexShrink: 0,
                    }}
                  >
                    Current
                  </span>
                )}
              </span>
              <span style={{ display: "block", ...rowLabel, marginTop: 2 }}>
                {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                {g.isTreasurer ? " · Treasurer" : ""}
              </span>
            </span>
            <span
              style={{ color: T.tertiary, fontSize: 18 }}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          <button
            onClick={() => onLeaveGroup(g.id)}
            aria-label={`Leave ${g.name}`}
            style={{
              flexShrink: 0,
              padding: "0 16px",
              border: "none",
              borderLeft: `1px solid ${T.border}`,
              background: "none",
              color: T.red,
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Leave
          </button>
        </div>
      ))}
    </div>
  );
}
