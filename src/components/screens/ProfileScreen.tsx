"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import type { ProfileEdits, ProfileSaveResult } from "@/lib/types";
import ProfileCard from "@/components/profile/ProfileCard";
import GroupList, { type ProfileGroup } from "@/components/profile/GroupList";
import { sectionLabel } from "@/components/profile/styles";

export type { ProfileGroup };

interface ProfileScreenProps {
  name: string;
  email?: string;
  venmo: string;
  zelle: string;
  avatarUrl?: string;
  /** Email changes need an auth backend, so they're hidden in sandbox mode. */
  canEditEmail: boolean;
  groups: ProfileGroup[];
  activeGroupId: string | null;
  onBack: () => void;
  onSave: (edits: ProfileEdits) => Promise<ProfileSaveResult>;
  onUploadAvatar: (file: File) => Promise<string>;
  onEnterGroup: (id: string) => void;
  onLeaveGroup: (id: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  onLogout?: () => void;
}

export default function ProfileScreen({
  name,
  email,
  venmo,
  zelle,
  avatarUrl,
  canEditEmail,
  groups,
  activeGroupId,
  onBack,
  onSave,
  onUploadAvatar,
  onEnterGroup,
  onLeaveGroup,
  onCreateGroup,
  onJoinGroup,
  onLogout,
}: ProfileScreenProps) {
  const [notice, setNotice] = useState("");

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "20px 20px 80px",
        fontFamily: T.font,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Go back"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            border: "none",
            background: T.cardSolid,
            borderRadius: T.radiusSm,
            boxShadow: T.shadow,
            color: T.text,
            fontSize: 17,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ‹
        </button>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Profile
        </h1>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            background: "rgba(52,199,89,0.12)",
            color: "#1c7c3a",
            borderRadius: T.radiusSm,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 12,
          }}
        >
          {notice}
        </div>
      )}

      <ProfileCard
        name={name}
        email={email}
        venmo={venmo}
        zelle={zelle}
        avatarUrl={avatarUrl}
        canEditEmail={canEditEmail}
        onSave={onSave}
        onUploadAvatar={onUploadAvatar}
        onSaved={setNotice}
      />

      <div style={sectionLabel}>Your groups</div>
      <GroupList
        groups={groups}
        activeGroupId={activeGroupId}
        onEnterGroup={onEnterGroup}
        onLeaveGroup={onLeaveGroup}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <GroupAction label="Start a group" onClick={onCreateGroup} />
        <GroupAction label="Join a group" onClick={onJoinGroup} />
      </div>

      {onLogout && (
        <>
          <div style={sectionLabel}>Account</div>
          <button
            onClick={onLogout}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: T.radius,
              border: "none",
              background: T.cardSolid,
              boxShadow: T.shadow,
              color: T.red,
              fontFamily: T.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </>
      )}
    </div>
  );
}

function GroupAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "12px 16px",
        borderRadius: T.radiusSm,
        border: "none",
        background: "rgba(0,122,255,0.1)",
        color: T.blue,
        fontFamily: T.font,
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
