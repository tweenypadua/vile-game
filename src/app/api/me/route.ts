import { getUser } from "@/lib/supabase/server";
import { handle } from "@/lib/server/http";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/me  →  { email, isAdmin } or { email: null } */
export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return { email: null, isAdmin: false };
    return { email: user.email, isAdmin: env.adminEmails().includes((user.email || "").toLowerCase()) };
  });
}
