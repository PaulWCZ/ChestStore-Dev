import type { Member } from "@argentic/chest-sdk/member";
import { Island } from "../core/island.tsx";
import { AppError, notFound } from "../core/tool.ts";
import { plural, type Catalogue, type Locale } from "../i18n/index.ts";
import { edits, surveys } from "../lib/access.ts";
import { groups } from "../lib/audience.ts";
import { emptyValue, pulseValue, type ComposerValue } from "../lib/composer-value.ts";
import { dates } from "../lib/dates.ts";
import type { Sql } from "../lib/db.ts";
import { isKind } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { load, mayCreate, policy, rights, type Poll } from "../lib/polls.ts";
import { local } from "../lib/time.ts";
import { chestToday, chestZone } from "../lib/zone.ts";

// The composer's pages: a new poll of the kind chosen on the home page (a
// question by default) or the team pulse (a weekly anonymous survey, ready
// to send) at /chest/new; a draft to finish, or an open poll's words and
// closing time, at /chest/polls/<id>/edit (its organiser only). The
// composer itself is an island (src/islands/Composer.tsx).
type Context = { sql: Sql; member: Member; locale: Locale; t: Catalogue };

async function composer(c: Context, props: { mode: "new" | "draft" | "open"; pollId: string | null; initial: ComposerValue; round?: boolean }) {
  const { sql, member, locale, t } = c;
  const d = dates(locale, chestZone());
  const known = await groups();
  return (
    <div className="narrow centred">
      <Island name="Composer" props={{
        ...props,
        groups: known === null ? null : known.map(g => ({ id: g.id, name: g.name, size: plural(t.composer.groupSize, g.size, locale) })),
        today: chestToday(),
        monthNames: d.monthNames(),
        weekdayNames: d.weekdayNames(),
        locale,
        surveys: surveys(member, await policy(sql)),
        t: { composer: t.composer, kinds: t.kinds, repeat: t.repeat, date: t.kit.date, peoplePicker: t.kit.peoplePicker },
      }} />
    </div>
  );
}

export async function newPoll(c: Context, kind: string | undefined, preset: string | undefined) {
  if (!(await mayCreate(c.sql, c.member))) notFound();
  const w = c.t.composer;
  // The team pulse is a company survey: organisers only, unless an admin
  // opened it to members (src/lib/access.ts).
  const mayPulse = surveys(c.member, await policy(c.sql));
  const initial = preset === "pulse" && mayPulse
    ? pulseValue({ title: w.pulseTitle, scale: w.pulseScale, low: w.pulseLow, high: w.pulseHigh, enps: w.enpsDefault, text: w.pulseText })
    : emptyValue(isKind(kind) ? kind : preset === "pulse" ? "survey" : "choice");
  return { title: w.newTitle, body: await composer(c, { mode: "new", pollId: null, initial }) };
}

export async function editPoll(c: Context, id: string) {
  let poll: Poll;
  try {
    poll = await load(c.sql, id);
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  if (poll.deleted || !edits(c.member, rights(poll))) notFound();
  const first = poll.questions[0];
  const days: ComposerValue["days"] = [];
  if (poll.kind === "date" && first) {
    for (const o of first.options) {
      const day = days.find(x => x.day === o.day) ?? (days.push({ day: o.day!, slots: [] }), days.at(-1)!);
      if (o.start) day.slots.push({ start: o.start, end: o.end ?? "" });
    }
  }
  const picked = await people(poll.people);
  const initial: ComposerValue = {
    kind: poll.kind,
    title: poll.title,
    details: poll.details,
    options: poll.kind === "choice" && first ? first.options.map(o => o.label) : ["", ""],
    multiple: poll.kind === "choice" ? first?.multiple ?? false : false,
    other: poll.kind === "choice" ? first?.other ?? false : false,
    days,
    questions: poll.kind === "survey" ? poll.questions.map(q => ({ kind: q.kind === "date" ? "choice" : q.kind, text: q.text, options: q.options.length > 0 ? q.options.map(o => o.label) : ["", ""], multiple: q.multiple, low: q.low, high: q.high })) : [{ kind: "scale", text: "", options: ["", ""], multiple: false, low: "", high: "" }],
    anonymous: poll.anonymous,
    results: poll.results,
    everyone: poll.everyone,
    groups: poll.groups,
    people: poll.people.filter(p => p.startsWith("mbr_")).map(p => ({ id: p, name: nameOf(picked.get(p), c.locale) })),
    closes: poll.closesAt ? local(poll.closesAt, chestZone()) : null,
    slots: poll.slots,
    repeat: poll.repeat,
  };
  const mode = poll.status === "draft" ? "draft" : "open";
  return { title: mode === "draft" ? c.t.composer.draftTitle : c.t.composer.editTitle, body: await composer(c, { mode, pollId: poll.id, initial, round: poll.seriesId !== null }) };
}
