// Refuses to package a release that carries the dev licensing bypass, or that
// has no licensing configuration at all.
//
// Runs before `vite build` in the zxp and zip scripts. Exits non-zero, so the
// && chain stops and no artifact is produced - a bypassed build cannot ship by
// forgetting, only by editing this file.

import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
const env = {};

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

const fail = (lines) => {
  console.error("\n  RELEASE BLOCKED\n");
  for (const l of lines) console.error("  " + l);
  console.error("");
  process.exit(1);
};

if (env.VITE_LICENSE_BYPASS === "true" || process.env.VITE_LICENSE_BYPASS === "true") {
  fail([
    "VITE_LICENSE_BYPASS is set to true.",
    "",
    "That flag skips the activation gate and is for local development only.",
    "Set it to false in .env (or remove the line) before packaging.",
  ]);
}

const missing = ["VITE_LICENSE_ENDPOINT", "VITE_LICENSE_KEY"].filter((key) => {
  const value = env[key] ?? process.env[key] ?? "";
  return value === "" || value.includes("REPLACE_WITH_");
});

if (missing.length > 0) {
  fail([
    `Licensing is not configured: ${missing.join(", ")}`,
    "",
    "A packaged build with placeholders reports itself unconfigured and cannot",
    "activate. Copy .env.example to .env and fill in the real values.",
  ]);
}

console.log("release check: licensing configured, bypass off");
