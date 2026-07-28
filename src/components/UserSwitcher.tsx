"use client";

import { T } from "@/lib/tokens";
import type { Group, Member } from "@/lib/types";

interface UserSwitcherProps {
  group: Group;
  currentUser: Member;
  setCurrentUser: (user: Member) => void;
}

export default function UserSwitcher({
  group,
  currentUser,
  setCurrentUser,
}: UserSwitcherProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30,30,30,0.9)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#fff",
        borderRadius: 14,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 100,
        boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)" }}>Viewing as</span>
      <select
        aria-label="Viewing as"
        value={currentUser.id}
        onChange={(e) =>
          setCurrentUser(group.members.find((m) => m.id === e.target.value)!)
        }
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "5px 10px",
          fontFamily: T.font,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {group.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isTreasurer ? " (Treasurer)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
