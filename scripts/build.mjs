import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outdir = path.join(root, "dist");
const targetArg = process.argv.find((value) => value.startsWith("--target="));
const target = targetArg ? targetArg.slice("--target=".length) : "firefox";

if (!["firefox", "chrome", "all"].includes(target)) {
  throw new Error(`Unsupported build target: ${target}`);
}

async function buildTarget(name, browserTarget, manifestFile) {
  const targetOutdir = path.join(outdir, name);

  await mkdir(targetOutdir, { recursive: true });
  await mkdir(path.join(targetOutdir, "icons"), { recursive: true });

  await build({
    entryPoints: {
      background: "src/background/index.ts",
      content: "src/content/index.ts",
      options: "src/options/main.ts"
    },
    outdir: targetOutdir,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: browserTarget,
    sourcemap: true,
    logLevel: "info"
  });

  await cp(path.join(root, "assets", manifestFile), path.join(targetOutdir, "manifest.json"));
  await cp(path.join(root, "assets", "icons"), path.join(targetOutdir, "icons"), { recursive: true });
  await cp(path.join(root, "src", "options", "index.html"), path.join(targetOutdir, "options.html"));
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (target === "firefox" || target === "all") {
  await buildTarget("firefox", "firefox140", "manifest.firefox.json");
}

if (target === "chrome" || target === "all") {
  await buildTarget("chrome", "chrome120", "manifest.chrome.json");
}
