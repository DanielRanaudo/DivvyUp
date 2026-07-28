"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle } from "@/lib/tokens";
import { INVITE_CODE_LENGTH, normalizeInviteCode } from "@/lib/utils";
import type { Group } from "@/lib/types";

interface JoinGroupScreenProps {
  onBack: () => void;
  onJoin: (groupId: string, name: string, venmo: string) => void;
  onJoinCode?: (
    code: string,
    name: string,
    venmo: string
  ) => Promise<string | null>;
  groups: Group[];
}

export default function JoinGroupScreen({
  onBack,
  onJoin,
  onJoinCode,
  groups,
}: JoinGroupScreenProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = code.length === INVITE_CODE_LENGTH && name.trim() && !busy;

  const handleJoin = async () => {
    if (onJoinCode) {
      setBusy(true);
      setError("");
      const err = await onJoinCode(code, name.trim(), venmo.trim());
      if (err) setError(err);
      setBusy(false);
      return;
    }

    const g = groups.find((g) => g.code === code);
    if (!g) {
      setError("Group not found");
      return;
    }
    if (
      g.members.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
    ) {
      setError("Name already taken");
      return;
    }
    onJoin(g.id, name.trim(), venmo.trim());
  };

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
        }}
      >
        Join a Group
      </h2>
      <p
        style={{
          fontSize: 15,
          color: T.secondary,
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Enter the invite code from your treasurer.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle} htmlFor="join-invite-code">
            Invite Code
          </label>
          <input
            id="join-invite-code"
            value={code}
            onChange={(e) => {
              setCode(normalizeInviteCode(e.target.value));
              setError("");
            }}
            placeholder="A1B2C3D4E5"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            style={{
              ...inputStyle,
              fontFamily: T.mono,
              letterSpacing: "0.12em",
              fontSize: 20,
              textAlign: "center",
              fontWeight: 600,
            }}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="join-your-name">
            Your Name
          </label>
          <input
            id="join-your-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="join-venmo-zelle">
            Venmo / Zelle
          </label>
          <input
            id="join-venmo-zelle"
            value={venmo}
            onChange={(e) => setVenmo(e.target.value)}
            placeholder="@yourhandle (optional)"
            style={inputStyle}
          />
        </div>
        {error && (
          <div style={{ color: T.red, fontSize: 14, fontWeight: 500 }}>
            {error}
          </div>
        )}
        <button
          onClick={() => canSubmit && handleJoin()}
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
            boxShadow: canSubmit ? "0 4px 16px rgba(0,122,255,0.3)" : "none",
          }}
        >
          Join Group
        </button>
      </div>
    </div>
  );
}
