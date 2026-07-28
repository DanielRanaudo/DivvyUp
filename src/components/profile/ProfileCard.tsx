"use client";

import { useRef, useState } from "react";
import { T, cardStyle, inputStyle, labelStyle } from "@/lib/tokens";
import {
  formatZelle,
  isValidEmail,
  isValidZelle,
  normalizeVenmo,
} from "@/lib/profile";
import type { ProfileEdits, ProfileSaveResult } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { pillButton, rowLabel } from "@/components/profile/styles";

interface ProfileCardProps {
  name: string;
  email?: string;
  venmo: string;
  zelle: string;
  avatarUrl?: string;
  /** Email changes need an auth backend, so they're hidden in sandbox mode. */
  canEditEmail: boolean;
  onSave: (edits: ProfileEdits) => Promise<ProfileSaveResult>;
  onUploadAvatar: (file: File) => Promise<string>;
  onSaved: (notice: string) => void;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

/** Who you are and how people pay you, read-only until you say otherwise. */
export default function ProfileCard({
  name,
  email,
  venmo,
  zelle,
  avatarUrl,
  canEditEmail,
  onSave,
  onUploadAvatar,
  onSaved,
}: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftVenmo, setDraftVenmo] = useState(venmo);
  const [draftZelle, setDraftZelle] = useState(zelle);
  const [draftEmail, setDraftEmail] = useState(email ?? "");
  const [draftAvatar, setDraftAvatar] = useState(avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraftVenmo(venmo);
    setDraftZelle(zelle);
    setDraftEmail(email ?? "");
    setDraftAvatar(avatarUrl);
    setError("");
    setEditing(true);
  };

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    // Cleared so picking the same file twice still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Profile pictures must be a PNG or JPG.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      setDraftAvatar(await onUploadAvatar(file));
    } catch (e) {
      setError(`Couldn't upload that picture — ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!isValidZelle(draftZelle)) {
      setError("Enter a 10-digit phone number for Zelle, or leave it blank.");
      return;
    }
    const emailChanged = canEditEmail && draftEmail.trim() !== (email ?? "");
    if (emailChanged && !isValidEmail(draftEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setSaving(true);
    const result = await onSave({
      venmo: normalizeVenmo(draftVenmo),
      zelle: formatZelle(draftZelle),
      email: emailChanged ? draftEmail.trim() : undefined,
      avatarUrl: draftAvatar,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved(result.notice ?? "Profile updated.");
    setEditing(false);
  };

  const busy = saving || uploading;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar
          name={name}
          index={0}
          size={56}
          src={editing ? draftAvatar : avatarUrl}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          {!editing && email && (
            <div
              style={{
                ...rowLabel,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </div>
          )}
          {editing && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Profile picture"
                onChange={(e) => void handleFile(e.target.files)}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  ...pillButton,
                  background: "rgba(0,122,255,0.1)",
                  color: T.blue,
                  cursor: uploading ? "default" : "pointer",
                }}
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
              {draftAvatar && (
                <button
                  onClick={() => setDraftAvatar(undefined)}
                  style={{
                    ...pillButton,
                    background: T.bg,
                    color: T.secondary,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ marginTop: 18 }}>
          {canEditEmail && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor="profile-email">
                Email
              </label>
              <input
                id="profile-email"
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="profile-venmo">
              Venmo
            </label>
            <input
              id="profile-venmo"
              value={draftVenmo}
              onChange={(e) => setDraftVenmo(e.target.value)}
              placeholder="@your-handle"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="profile-zelle">
              Zelle (phone number)
            </label>
            <input
              id="profile-zelle"
              type="tel"
              value={draftZelle}
              onChange={(e) => setDraftZelle(e.target.value)}
              placeholder="(555) 123-4567"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                color: T.red,
                fontSize: 13,
                fontWeight: 500,
                marginTop: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => void handleSave()}
              disabled={busy}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: T.radiusSm,
                border: "none",
                background: T.blue,
                color: "#fff",
                fontFamily: T.font,
                fontSize: 15,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={saving}
              style={{
                padding: "12px 16px",
                borderRadius: T.radiusSm,
                border: "none",
                background: T.bg,
                color: T.secondary,
                fontFamily: T.font,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <PayRow label="Venmo" value={venmo} first />
          <PayRow label="Zelle" value={zelle} />
          <button
            onClick={startEditing}
            style={{
              ...pillButton,
              background: "rgba(0,122,255,0.1)",
              color: T.blue,
              marginTop: 16,
            }}
          >
            Edit profile
          </button>
        </>
      )}
    </div>
  );
}

function PayRow({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: first ? 18 : 10,
        paddingTop: first ? 14 : 0,
        borderTop: first ? `1px solid ${T.border}` : undefined,
      }}
    >
      <span style={rowLabel}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: value ? T.text : T.tertiary,
          fontFamily: value ? T.mono : T.font,
        }}
      >
        {value || "Not set"}
      </span>
    </div>
  );
}
