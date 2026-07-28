export const IS_SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "true";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const HAS_SUPABASE = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";

export const USE_BACKEND = !IS_SANDBOX && HAS_SUPABASE;

/** Absolute origin, used to resolve Open Graph and manifest URLs. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Demo mode keeps everything in memory, which is the right default for `npm run
 * dev` but a disaster in production: a typo in a Vercel environment variable
 * would ship an app that accepts a month of rent and expenses and stores none
 * of it, with nothing to indicate anything was wrong.
 *
 * So a production build without a backend is a configuration error, not a
 * fallback — unless sandbox mode was asked for explicitly.
 */
function assertConfigured(): void {
  if (process.env.NODE_ENV !== "production" || IS_SANDBOX || HAS_SUPABASE) {
    return;
  }

  const missing = [
    SUPABASE_URL === "" && "NEXT_PUBLIC_SUPABASE_URL",
    SUPABASE_ANON_KEY === "" && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((name): name is string => typeof name === "string");

  throw new Error(
    `DivvyUp is missing ${missing.join(" and ")}. A production build needs a ` +
      "Supabase project, otherwise nothing users enter is saved. Set the " +
      "variables, or build with NEXT_PUBLIC_SANDBOX=true for a demo build."
  );
}

assertConfigured();

/**
 * True when the app is running without a backend, so the UI can say so rather
 * than letting someone mistake in-memory data for a real account.
 */
export const IS_DEMO = !USE_BACKEND;
