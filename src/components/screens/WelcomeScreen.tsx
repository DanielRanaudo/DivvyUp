"use client";

import { T } from "@/lib/tokens";

interface WelcomeScreenProps {
  onStart: () => void;
  onJoin: () => void;
  onLogout?: () => void;
  groups?: { id: string; name: string }[];
  onEnterGroup?: (id: string) => void;
  onLeaveGroup?: (id: string) => void;
}

export default function WelcomeScreen({
  onStart,
  onJoin,
  onLogout,
  groups = [],
  onEnterGroup,
  onLeaveGroup,
}: WelcomeScreenProps) {
  const hasGroups = groups.length > 0 && !!onEnterGroup;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "90vh",
        padding: 32,
        textAlign: "center",
        position: "relative",
      }}
    >
      {onLogout && (
        <button
          onClick={onLogout}
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "none",
            border: "none",
            color: T.secondary,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: T.font,
          }}
        >
          Log out
        </button>
      )}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: "linear-gradient(135deg, #007AFF, #5856D6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          boxShadow: "0 8px 24px rgba(0,122,255,0.3)",
        }}
      >
        <span
          style={{
            fontSize: 28,
            color: "#fff",
            fontWeight: 700,
            fontFamily: T.font,
          }}
        >
          ÷
        </span>
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          marginBottom: 6,
          color: T.text,
        }}
      >
        divvyup
      </div>
      <p
        style={{
          fontSize: 17,
          color: T.secondary,
          marginBottom: 44,
          maxWidth: 260,
          lineHeight: 1.5,
        }}
      >
        Split expenses with your roommates, effortlessly.
      </p>
      {hasGroups && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "100%",
            maxWidth: 320,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: T.tertiary,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              textAlign: "left",
            }}
          >
            Your groups
          </div>
          {groups.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                alignItems: "stretch",
                width: "100%",
                borderRadius: T.radius,
                background: T.cardSolid,
                boxShadow: T.shadow,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => onEnterGroup!(g.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flex: 1,
                  minWidth: 0,
                  padding: "14px 18px",
                  border: "none",
                  background: "none",
                  color: T.text,
                  fontFamily: T.font,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
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
                <span style={{ color: T.tertiary, fontSize: 18 }}>›</span>
              </button>
              {onLeaveGroup && (
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
              )}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <button
          onClick={onStart}
          style={{
            padding: "14px 24px",
            borderRadius: T.radius,
            border: "none",
            background: "#007AFF",
            color: "#fff",
            fontFamily: T.font,
            fontSize: 17,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,122,255,0.3)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseDown={(e) =>
            ((e.target as HTMLElement).style.transform = "scale(0.97)")
          }
          onMouseUp={(e) =>
            ((e.target as HTMLElement).style.transform = "scale(1)")
          }
        >
          Start a Group
        </button>
        <button
          onClick={onJoin}
          style={{
            padding: "14px 24px",
            borderRadius: T.radius,
            border: "none",
            background: "rgba(0,122,255,0.1)",
            color: "#007AFF",
            fontFamily: T.font,
            fontSize: 17,
            fontWeight: 600,
            cursor: "pointer",
            transition: "transform 0.15s",
          }}
          onMouseDown={(e) =>
            ((e.target as HTMLElement).style.transform = "scale(0.97)")
          }
          onMouseUp={(e) =>
            ((e.target as HTMLElement).style.transform = "scale(1)")
          }
        >
          Join a Group
        </button>
      </div>
    </div>
  );
}
