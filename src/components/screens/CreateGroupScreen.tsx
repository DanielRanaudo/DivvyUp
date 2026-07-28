"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle } from "@/lib/tokens";

interface CreateGroupScreenProps {
  onBack: () => void;
  onCreate: (groupName: string) => void;
}

export default function CreateGroupScreen({
  onBack,
  onCreate,
}: CreateGroupScreenProps) {
  const [groupName, setGroupName] = useState("");
  const canSubmit = groupName.trim();

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "48px 24px" }}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: T.blue,
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 500,
          marginBottom: 24,
          padding: 0,
          fontFamily: T.font,
        }}
      >
        ‹ Back
      </button>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: "-0.03em",
          color: T.text,
        }}
      >
        Start a Group
      </h2>
      <p
        style={{
          fontSize: 15,
          color: T.secondary,
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        You&apos;ll be the treasurer — managing rent, utilities, and approving
        expenses.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle} htmlFor="create-group-group-name">
            Group Name
          </label>
          <input
            id="create-group-group-name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder='e.g. "4200 Walnut St"'
            style={inputStyle}
          />
        </div>
        <button
          onClick={() => canSubmit && onCreate(groupName.trim())}
          style={{
            padding: "14px 24px",
            borderRadius: T.radius,
            border: "none",
            background: canSubmit ? "#007AFF" : "#c7c7cc",
            color: "#fff",
            fontFamily: T.font,
            fontSize: 17,
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "default",
            marginTop: 8,
            transition: "background 0.2s",
            boxShadow: canSubmit ? "0 4px 16px rgba(0,122,255,0.3)" : "none",
          }}
        >
          Create Group
        </button>
      </div>
    </div>
  );
}
