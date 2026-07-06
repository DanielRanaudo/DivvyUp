"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { HAS_SUPABASE } from "@/lib/config";

interface SignUpArgs {
  email: string;
  password: string;
  name: string;
  venmo: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    args: SignUpArgs
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(
    () => (HAS_SUPABASE ? createClient() : null),
    []
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(HAS_SUPABASE);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn: async (email, password) => {
        if (!supabase) return { error: "Backend not configured" };
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return { error: error?.message ?? null };
      },
      signUp: async ({ email, password, name, venmo }) => {
        if (!supabase)
          return { error: "Backend not configured", needsConfirmation: false };
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim(), venmo: venmo.trim() } },
        });
        if (error) return { error: error.message, needsConfirmation: false };
        // Supabase obfuscates duplicate signups (to prevent email enumeration):
        // an existing account comes back with an empty `identities` array.
        const alreadyExists =
          !!data.user && (data.user.identities?.length ?? 0) === 0;
        if (alreadyExists) {
          return {
            error:
              "An account with this email already exists. Try logging in instead.",
            needsConfirmation: false,
          };
        }
        return { error: null, needsConfirmation: !data.session };
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        if (!supabase) return { error: "Backend not configured" };
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/reset-password`
                : undefined,
          }
        );
        return { error: error?.message ?? null };
      },
      updatePassword: async (password) => {
        if (!supabase) return { error: "Backend not configured" };
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
    }),
    [session, loading, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
