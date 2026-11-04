/**
 * Builds the browser extension into extension/dist (load it unpacked in chrome://extensions) and packs
 * extension/zcan-extension.zip for the Chrome Web Store. The link cleaner is the site's own
 * src/lib/link-clean.ts, bundled in, so the extension and zcan.dev always clean links the same way.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";

const root = new URL("../extension/", import.meta.url).pathname;
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { background: join(root, "src/background.ts"), content: join(root, "src/content.ts"), popup: join(root, "src/popup.ts") },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

cpSync(join(root, "manifest.json"), join(dist, "manifest.json"));
cpSync(join(root, "src/popup.html"), join(dist, "popup.html"));
cpSync(join(root, "src/popup.css"), join(dist, "popup.css"));
cpSync(join(root, "_locales"), join(dist, "_locales"), { recursive: true });
cpSync(join(root, "icons"), join(dist, "icons"), { recursive: true });

// The extension must never talk to the network: fail the build if a bundle mentions fetch or XHR.
for (const f of ["background.js", "content.js", "popup.js"]) {
  const code = readFileSync(join(dist, f), "utf8");
  if (/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(code)) throw new Error(`${f} contains a network call`);
}

const zip = new JSZip();
const add = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) add(p);
    else zip.file(relative(dist, p), readFileSync(p));
  }
};
add(dist);
writeFileSync(join(root, "zcan-extension.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
const { version } = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
console.log(`Built extension ${version} → extension/dist and extension/zcan-extension.zip`);
