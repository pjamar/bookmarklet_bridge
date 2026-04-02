import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(root, "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await mkdir(path.join(outdir, "icons"), { recursive: true });

await build({
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    options: "src/options/main.ts"
  },
  outdir,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox128",
  sourcemap: true,
  logLevel: "info"
});

await cp(path.join(root, "assets", "manifest.json"), path.join(outdir, "manifest.json"));
await cp(path.join(root, "assets", "icons"), path.join(outdir, "icons"), { recursive: true });
await cp(path.join(root, "src", "options", "index.html"), path.join(outdir, "options.html"));
