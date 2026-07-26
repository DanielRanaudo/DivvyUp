export const IS_SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "true";

// Layout toggle: when true, navigation lives in a left sidebar (with a mobile
// hamburger drawer); when false, it falls back to the original top tab bar.
// Flip this to instantly revert the layout.
export const SIDEBAR_NAV = true;

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const HAS_SUPABASE = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";

export const USE_BACKEND = !IS_SANDBOX && HAS_SUPABASE;
