import { db } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Runs once a day (vercel.json). Marks cases whose day has arrived as live, archives old ones,
 * and reports how many days of cases are left so editors can top up the schedule.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret()}`) return json({ error: "unauthorized" }, 401);
  const client = db();
  const now = new Date();
  // The earliest time zone (UTC+14) reaches tomorrow first.
  const tomorrow = new Date(now.getTime() + 14 * 3600e3).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);

  const live = await client.from("puzzles").update({ state: "live" }).eq("state", "scheduled").lte("publish_date", tomorrow).select("puzzle_number");
  const archived = await client.from("puzzles").update({ state: "archived" }).eq("state", "live").lt("publish_date", weekAgo).select("puzzle_number");
  const ahead = await client.from("puzzles").select("publish_date").gt("publish_date", tomorrow).order("publish_date", { ascending: false }).limit(1);

  const lastDate = ahead.data?.[0]?.publish_date ?? null;
  const daysLeft = lastDate ? Math.round((Date.parse(lastDate) - Date.parse(tomorrow)) / 864e5) : 0;
  if (daysLeft < 7) console.warn(`VILE!: only ${daysLeft} days of cases scheduled. Add more in /admin.`);

  return json({
    madeLive: live.data?.map((p) => p.puzzle_number) ?? [],
    archived: archived.data?.map((p) => p.puzzle_number) ?? [],
    lastScheduledDate: lastDate,
    daysLeft,
  });
}
