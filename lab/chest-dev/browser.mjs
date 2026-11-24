// The Chromium the studio's browser scripts launch (flows/lib.mjs,
// screens.mjs, audit.mjs): CHROMIUM_PATH when set; else the newest
// Chromium installed for Playwright (PLAYWRIGHT_BROWSERS_PATH, default
// /opt/pw-browsers: chromium-<build>/chrome-linux64/chrome, or chrome-linux/
// for older builds); else the newest headless shell there; else undefined,
// and playwright-core looks for the build it was released with.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function chromiumPath(env = process.env) {
  if (env["CHROMIUM_PATH"]) {
    if (!existsSync(env["CHROMIUM_PATH"])) throw new Error(`CHROMIUM_PATH=${env["CHROMIUM_PATH"]}: no such file`);
    return env["CHROMIUM_PATH"];
  }
  const base = env["PLAYWRIGHT_BROWSERS_PATH"] || "/opt/pw-browsers";
  let entries = [];
  try { entries = readdirSync(base); } catch { return undefined; }
  // Newest build first: chromium-1243 before chromium-1194.
  const builds = prefix => entries.map(name => [name, new RegExp(`^${prefix}-(\\d+)$`, "u").exec(name)?.[1]]).filter(([, n]) => n !== undefined).sort((a, b) => Number(b[1]) - Number(a[1])).map(([name]) => name);
  for (const dir of builds("chromium")) {
    for (const exe of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(join(base, dir, exe))) return join(base, dir, exe);
  }
  for (const dir of builds("chromium_headless_shell")) {
    for (const exe of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/headless_shell"]) if (existsSync(join(base, dir, exe))) return join(base, dir, exe);
  }
  return undefined;
}

export const executablePath = chromiumPath();
