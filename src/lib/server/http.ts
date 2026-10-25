import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/game-service";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Turns thrown errors into `{ error, message }` JSON with the right status code. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code, message: e.message }, e.status);
    console.error(e);
    return json({ error: "server_error", message: "Something went wrong. Try again in a moment." }, 500);
  }
}
