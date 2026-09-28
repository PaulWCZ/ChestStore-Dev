// Helpers for the studio's browser flows: a real Chromium against a tool
// running in the harness (dev.mjs), signed in as one of the cast.
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const executablePath = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(p => existsSync(p));
export const id = key => "mbr_" + key + "a".repeat(26 - key.length);

export async function open(port, member = "camille", options = {}) {
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
  const origin = `http://localhost:${port}`;
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 860 }, locale: "en-GB" });
  await context.addCookies([{ name: "dev_member", value: id(member), url: origin }, ...(options.locale ? [{ name: "dev_locale", value: options.locale, url: origin }] : [])]);
  const page = await context.newPage();
  const problems = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/u.test(m.text())) problems.push("console: " + m.text()); });
  page.on("pageerror", e => problems.push("page: " + e.message));
  page.on("response", r => { if (r.status() >= 500 || (r.status() === 404 && !options.allow404?.test(r.url()))) problems.push(`${r.status()} ${r.url()}`); });
  return { browser, context, page, origin, problems };
}

export async function as(context, origin, member) {
  await context.addCookies([{ name: "dev_member", value: id(member), url: origin }]);
}

let failures = 0;
export async function step(name, fn) {
  try {
    await fn();
    console.log("✓ " + name);
  } catch (error) {
    failures++;
    console.log("✗ " + name + "\n  " + String(error?.message ?? error).split("\n").slice(0, 4).join("\n  "));
  }
}
export function done(problems) {
  if (problems.length) {
    failures++;
    console.log("✗ browser problems:\n  " + problems.join("\n  "));
  }
  console.log(failures ? `${failures} failed` : "all passed");
  process.exit(failures ? 1 : 0);
}
export function expect(value, message) {
  if (!value) throw new Error(message);
}
