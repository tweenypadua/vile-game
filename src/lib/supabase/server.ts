import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase client bound to the visitor's auth cookies.
 * Use it to find out WHO is signed in. All game data is read and written
 * with the service client below, because the tables are closed to the browser by RLS.
 */
export function createAuthClient() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. Middleware refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user, or null. */
export async function getUser() {
  const { data } = await createAuthClient().auth.getUser();
  return data.user ?? null;
}

// Untyped on purpose: run `supabase gen types typescript` later to add generated table types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let service: SupabaseClient<any, any, any> | null = null;

/** Server-only client with the service role key. Bypasses RLS: never send it to the browser. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function db(): SupabaseClient<any, any, any> {
  if (!service) {
    service = createClient<any>(env.supabaseUrl(), env.serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}
