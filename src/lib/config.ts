export const IS_SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "true";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const HAS_SUPABASE = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";

export const USE_BACKEND = !IS_SANDBOX && HAS_SUPABASE;
