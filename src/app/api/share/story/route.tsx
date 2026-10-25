import { ImageResponse } from "next/og";
import { decodeSquares, formatCaseDate } from "@/lib/game";

export const runtime = "edge";

const C = {
  ink: "#150c0e",
  paper: "#f2f0e6",
  dim: "#c2b8b0",
  maroon: "#7a1424",
  crimson: "#9b1b2e",
  gold: "#d9a441",
  kraft: "#b9a676",
  kraftInk: "#2a2617",
  line: "#4f3438",
  card: "#f7f5ec",
};

const fonts = Promise.all([
  fetch(new URL("../../../../assets/fonts/ArchivoBlack.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL("../../../../assets/fonts/Archivo-600.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL("../../../../assets/fonts/Archivo-800.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL("../../../../assets/fonts/PermanentMarker.woff", import.meta.url)).then((r) => r.arrayBuffer()),
]);

/**
 * GET /api/share/story?c=2&d=2026-10-25&r=wrnnn&o=2&s=3&a=2.4&w=88
 * 1080×1920 PNG of a player's result for Instagram Stories. Holds no answer, so it is safe to cache publicly.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const squares = decodeSquares(p.get("r") || "") ?? decodeSquares("nnnnn")!;
  const caseNo = Math.max(1, Math.min(99999, Number(p.get("c")) || 1));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get("d") || "") ? (p.get("d") as string) : null;
  const won = squares.includes("right");
  const solvedOn = squares.indexOf("right") + 1;
  const streak = String(Math.max(0, Math.min(9999, Number(p.get("s")) || 0)));
  const avg = /^\d(\.\d)?$|^-$/.test(p.get("a") || "") ? (p.get("a") as string) : "-";
  const pct = String(Math.max(0, Math.min(100, Number(p.get("w")) || 0)));
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const sticker = won ? (Number(streak) > 1 ? `${streak}-DAY STREAK` : "CASE CLOSED") : "CASE UNSOLVED";
  const [black, a600, a800, marker] = await fonts;

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", background: C.ink, color: C.paper, fontFamily: "Archivo", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "110px 86px 0 86px", flexGrow: 1 }}>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: C.paper, color: C.ink, fontFamily: "Archivo Black", fontSize: 190, lineHeight: 1, padding: "24px 48px 20px", transform: "rotate(-4deg)" }}>
              VILE!
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 90, fontWeight: 800, fontSize: 36, letterSpacing: 6, color: C.dim }}>
            {`DAILY CASE #${caseNo}${date ? "  ·  " + formatCaseDate(date).toUpperCase() : ""}`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34, fontFamily: "Archivo Black", fontSize: 112, lineHeight: 1.03 }}>
            <span>{won ? "CONVICTED!" : "VILLAIN"}</span>
            <span>{won ? `EXHIBIT ${solvedOn}/5` : "ACQUITTED"}</span>
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 50 }}>
            {squares.map((s, i) => (
              <div
                key={i}
                style={{
                  width: 140,
                  height: 140,
                  background: s === "right" ? C.gold : s === "wrong" ? C.crimson : "transparent",
                  border: s === "none" ? `8px solid ${C.line}` : "none",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 70, background: C.card, color: C.ink, width: 908, height: 170, transform: "rotate(-1deg)", boxShadow: "0 14px 30px rgba(0,0,0,0.5)" }}>
            {[
              ["STREAK", streak],
              ["AVG. EXHIBITS", avg],
              ["WIN %", pct],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 302 }}>
                <span style={{ fontFamily: "Archivo Black", fontSize: 80, lineHeight: 1 }}>{value}</span>
                <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: 3, marginTop: 10 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 50, paddingRight: 10 }}>
            <div
              style={{
                display: "flex",
                background: won ? "#ffffff" : C.kraft,
                color: won ? C.maroon : C.kraftInk,
                fontFamily: "Archivo Black",
                fontSize: 60,
                padding: "22px 40px",
                transform: "rotate(4deg)",
                boxShadow: "0 14px 30px rgba(0,0,0,0.5)",
              }}
            >
              {sticker}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 70, width: 900, fontFamily: "Permanent Marker", fontSize: 64, lineHeight: 1.2, transform: "rotate(-3deg)" }}>
            {won ? "The defense rests. Can you name the film?" : "The defense fooled me. Can you name the film?"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: 250, padding: "0 86px", background: C.gold, color: "#141413" }}>
          <span style={{ fontFamily: "Archivo Black", fontSize: 58, lineHeight: 1.1 }}>PLAY TODAY&apos;S CASE</span>
          {site ? <span style={{ fontWeight: 600, fontSize: 36, marginTop: 14 }}>{site}</span> : null}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: [
        { name: "Archivo Black", data: black, weight: 400, style: "normal" },
        { name: "Archivo", data: a600, weight: 600, style: "normal" },
        { name: "Archivo", data: a800, weight: 800, style: "normal" },
        { name: "Permanent Marker", data: marker, weight: 400, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
