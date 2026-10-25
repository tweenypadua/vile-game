// Copies the .woff font files used by the Story image into src/assets/fonts.
// The image renderer (Satori) reads WOFF/TTF, not WOFF2. Run once after `npm install`: npm run fonts
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "src", "assets", "fonts");
mkdirSync(out, { recursive: true });

const files = [
  ["@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff", "ArchivoBlack.woff"],
  ["@fontsource/archivo/files/archivo-latin-600-normal.woff", "Archivo-600.woff"],
  ["@fontsource/archivo/files/archivo-latin-800-normal.woff", "Archivo-800.woff"],
  ["@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff", "PermanentMarker.woff"],
];

for (const [src, name] of files) {
  copyFileSync(join(process.cwd(), "node_modules", src), join(out, name));
  console.log("copied", name);
}
