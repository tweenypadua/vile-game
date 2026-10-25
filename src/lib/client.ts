"use client";

/** Browser helpers: this device's id, the local calendar date, and JSON calls to the API. */

const KEY = "vile:v2";

export interface LocalState {
  playerId: string;
  seenHelp: boolean;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function loadLocal(): LocalState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s.playerId === "string") return s;
  } catch {}
  const fresh = { playerId: uuid(), seenHelp: false };
  saveLocal(fresh);
  return fresh;
}

export function saveLocal(s: LocalState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** The player's own calendar date, YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function untilMidnight(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

export class ApiFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, playerId: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Player-Id": playerId },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(data.error || "error", data.message || "Something went wrong. Try again.");
  return data as T;
}
