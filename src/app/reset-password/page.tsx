"use client";

import { useState } from "react";
import Link from "next/link";
import { T, inputStyle, labelStyle } from "@/lib/tokens";
import { useAuth } from "@/context/AuthProvider";

export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= 6 && password === confirm;

  const submit = async () => {
    if (busy) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await updatePassword(password);
    if (error) setError(error);
    else setDone(true);
    setBusy(false);
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "56px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #007AFF, #5856D6)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            boxShadow: "0 8px 24px rgba(0,122,255,0.3)",
          }}
        >
          <span style={{ fontSize: 26, color: "#fff", fontWeight: 700 }}>
            ÷
          </span>
        </div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            margin: 0,
            color: T.text,
          }}
        >
          Reset your password
        </h2>
      </div>
      {children}
    </div>
  );

  if (loading) {
    return shell(
      <p style={{ textAlign: "center", color: T.secondary, fontSize: 15 }}>
        Loading…
      </p>
    );
  }

  if (done) {
    return shell(
      <div style={{ textAlign: "center" }}>
        <p style={{ color: T.green, fontSize: 15, fontWeight: 500 }}>
          Your password has been updated.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "12px 24px",
            borderRadius: T.radius,
            background: "#007AFF",
            color: "#fff",
            fontFamily: T.font,
            fontSize: 16,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Continue to DivvyUp
        </Link>
      </div>
    );
  }

  if (!session) {
    return shell(
      <div style={{ textAlign: "center" }}>
        <p style={{ color: T.secondary, fontSize: 15 }}>
          This reset link is invalid or has expired. Request a new one from the
          login screen.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            color: T.blue,
            fontFamily: T.font,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Back to login
        </Link>
      </div>
    );
  }

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p
        style={{
          fontSize: 15,
          color: T.secondary,
          textAlign: "center",
          margin: 0,
        }}
      >
        Enter a new password for your account.
      </p>
      <div>
        <label style={labelStyle} htmlFor="reset-new-password">
          New Password
        </label>
        <input
          id="reset-new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="reset-confirm-password">
          Confirm Password
        </label>
        <input
          id="reset-confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Re-enter password"
          style={inputStyle}
        />
      </div>

      {error && (
        <div style={{ color: T.red, fontSize: 14, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit || busy}
        style={{
          padding: "14px 24px",
          borderRadius: T.radius,
          border: "none",
          background: canSubmit && !busy ? "#007AFF" : "#c7c7cc",
          color: "#fff",
          fontFamily: T.font,
          fontSize: 17,
          fontWeight: 600,
          cursor: canSubmit && !busy ? "pointer" : "default",
          marginTop: 4,
          boxShadow:
            canSubmit && !busy ? "0 4px 16px rgba(0,122,255,0.3)" : "none",
        }}
      >
        {busy ? "Please wait…" : "Update Password"}
      </button>
    </div>
  );
}
