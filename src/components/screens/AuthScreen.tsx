"use client";

import { useState } from "react";
import { T, inputStyle, labelStyle } from "@/lib/tokens";
import { useAuth } from "@/context/AuthProvider";

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const canSubmit =
    email.trim() &&
    password.length >= 6 &&
    (!isSignup || name.trim());

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    if (isSignup) {
      const { error, needsConfirmation } = await signUp({
        email,
        password,
        name,
        venmo,
      });
      if (error) setError(error);
      else if (needsConfirmation)
        setInfo("Check your email to confirm your account, then log in.");
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    }
    setBusy(false);
  };

  const handleForgot = async () => {
    if (busy) return;
    if (!email.trim()) {
      setError("Enter your email above, then tap “Forgot password?” again.");
      setInfo("");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    const { error } = await resetPassword(email);
    if (error) setError(error);
    else setInfo("Password reset email sent. Check your inbox.");
    setBusy(false);
  };

  return (
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
          <span style={{ fontSize: 26, color: "#fff", fontWeight: 700 }}>÷</span>
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
          {isSignup ? "Create your account" : "Welcome back"}
        </h2>
        <p style={{ fontSize: 15, color: T.secondary, marginTop: 6 }}>
          {isSignup
            ? "Sign up to start splitting with your roommates."
            : "Log in to your DivvyUp account."}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {isSignup && (
          <>
            <div>
              <label style={labelStyle}>Your Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daniel"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Venmo / Zelle</label>
              <input
                value={venmo}
                onChange={(e) => setVenmo(e.target.value)}
                placeholder="@danielv (optional)"
                style={inputStyle}
              />
            </div>
          </>
        )}
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="At least 6 characters"
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ color: T.red, fontSize: 14, fontWeight: 500 }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ color: T.green, fontSize: 14, fontWeight: 500 }}>
            {info}
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
          {busy ? "Please wait…" : isSignup ? "Sign Up" : "Log In"}
        </button>

        {!isSignup && (
          <button
            onClick={handleForgot}
            disabled={busy}
            style={{
              background: "none",
              border: "none",
              color: T.secondary,
              cursor: busy ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: T.font,
              marginTop: -4,
            }}
          >
            Forgot password?
          </button>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button
          onClick={() => {
            setMode(isSignup ? "login" : "signup");
            setError("");
            setInfo("");
          }}
          style={{
            background: "none",
            border: "none",
            color: T.blue,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: T.font,
          }}
        >
          {isSignup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
