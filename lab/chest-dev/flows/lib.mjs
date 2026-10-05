// Helpers for the studio's browser flows: a real Chromium against a tool
// running in the harness (dev.mjs), signed in as one of the cast.
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const executablePath = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(p => existsSync(p));
export const id = key => "mbr_" + key + "a".repeat(26 - key.length);

// The harness's hosts are https with a self-signed certificate
// (lab/chest-dev/cert.mjs): the browser accepts it, and so does Node's
// fetch() in a flow.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// origin: the team host (/chest…, /_dev); publicOrigin: the public host
// (port + 2), where a public page lives — a GET of a public path on the
// team host is redirected there (302), so compare URLs with publicOrigin.
export async function open(port, member = "camille", options = {}) {
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--lang=en-GB"] });
  const origin = `https://127.0.0.1:${port}`;
  const publicOrigin = `https://localhost:${port + 2}`;
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: options.viewport ?? { width: 1280, height: 860 }, locale: "en-GB" });
  // options.language (or options.locale, its former name): the member's
  // language on /chest, instead of theirs (cookie dev_locale).
  const language = options.language ?? options.locale;
  await context.addCookies([{ name: "dev_member", value: id(member), url: origin }, ...(language ? [{ name: "dev_locale", value: language, url: origin }] : [])]);
  const page = await context.newPage();
  const problems = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/u.test(m.text())) problems.push("console: " + m.text()); });
  page.on("pageerror", e => problems.push("page: " + e.message));
  page.on("response", r => { if (r.status() >= 500 || (r.status() === 404 && !options.allow404?.test(r.url()))) problems.push(`${r.status()} ${r.url()}`); });
  return { browser, context, page, origin, publicOrigin, problems };
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
// The harness's controls (lab/chest-dev/README.md), for flows: a POST to
// /_dev/<control> with a form, which answers 303 when done.
export async function control(page, origin, name, form) {
  const answer = await page.request.post(`${origin}/_dev/${name}`, { form, maxRedirects: 0 });
  if (answer.status() !== 303) throw new Error(`/_dev/${name} answered ${answer.status()}: ${await answer.text()}`);
}

export function expect(value, message) {
  if (!value) throw new Error(message);
}
