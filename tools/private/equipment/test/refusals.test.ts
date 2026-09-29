import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// One refusal for the managers' pages: someone whose role does not manage
// equipment gets HTTP 403 and the kit's NoAccess saying "This page is for
// managers" (app/chest/forbidden.tsx) — on every such route, never a 404
// on one and a 200 on another. A thing the person may not see at all
// (someone else's item, someone else's sheet) stays "not found". The
// browser flow (lab/chest-dev/flows/equipment.mjs) checks the status of
// each route in the harness.
const app = join(import.meta.dirname, "..", "app", "chest");
const managersPages = [
  "items/new/page.tsx",
  "items/[id]/edit/page.tsx",
  "import/page.tsx",
  "settings/page.tsx",
  "inventory/page.tsx",
  "inventory/[id]/page.tsx",
  "labels/page.tsx",
  "people/page.tsx",
  "people/[id]/page.tsx",
  "people/[id]/return/page.tsx",
];

for (const page of managersPages) {
  test(`/chest/${page.replace(/\/?page\.tsx$/u, "")}: a member is refused with 403 (forbidden()), before anything is read`, () => {
    const text = readFileSync(join(app, page), "utf8");
    const guard = text.indexOf('if (!can(member, "items.manage")) forbidden();');
    assert.ok(guard > 0, "the guard");
    assert.ok(!/items\.manage"\)\) notFound\(\)/u.test(text), "never a 404 for a role");
    // Nothing is read from the database before the guard.
    assert.ok(text.indexOf("db()") === -1 || text.indexOf("db()") > guard, "the guard comes first");
  });
}

test("the refusal page is the kit's NoAccess, with the managers' words and a way to one's own things", () => {
  const text = readFileSync(join(app, "forbidden.tsx"), "utf8");
  assert.match(text, /<NoAccess title=\{t\.managersOnly\.title\} body=\{t\.managersOnly\.body\}/u);
  assert.match(text, /href="\/chest\/mine"/u);
  const config = readFileSync(join(import.meta.dirname, "..", "next.config.ts"), "utf8");
  assert.match(config, /authInterrupts: true/u);
});

test("the CSV export answers 403 to a member", () => {
  const text = readFileSync(join(app, "export", "route.ts"), "utf8");
  assert.match(text, /if \(!actor \|\| !can\(actor, "items\.manage"\)\) return new Response\(null, \{ status: 403 \}\);/u);
});
