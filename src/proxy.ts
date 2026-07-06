import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { HAS_SUPABASE, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

// Next.js 16 renamed Middleware to Proxy. This keeps the Supabase auth
// session cookies fresh on navigation. It is a no-op until Supabase env
// vars are configured, so the app runs fine without a backend (e.g. sandbox).
export async function proxy(request: NextRequest) {
  if (!HAS_SUPABASE) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
