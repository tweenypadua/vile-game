import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Supabase sends magic-link and Google sign-ins here with a one-time code. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (code) {
    const { error } = await createAuthClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(`${safeNext}${safeNext.includes("?") ? "&" : "?"}signedin=1`, url.origin));
  }
  return NextResponse.redirect(new URL("/?signin=failed", url.origin));
}
