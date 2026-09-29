import { notFound } from "next/navigation";
import { edits } from "../../../../../lib/access.ts";
import { AppError } from "../../../../../lib/app-error.ts";
import { groups } from "../../../../../lib/audience.ts";
import { dates } from "../../../../../lib/dates.ts";
import { db } from "../../../../../lib/db.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { load, rights, type Poll } from "../../../../../lib/polls.ts";
import { viewer } from "../../../../../lib/session.ts";
import { local } from "../../../../../lib/time.ts";
import { chestToday } from "../../../../../lib/zone.ts";
import type { ComposerValue } from "../../../../../lib/composer-value.ts";
import { Composer } from "../../../composer.tsx";

// A draft to finish, or an open poll's words and closing time to change —
// its organiser only.
export default async function EditPoll({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const { id } = await params;
  let poll: Poll;
  try {
    poll = await load(db(), id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  if (poll.deleted || !edits(member, rights(poll))) notFound();
  const d = dates(locale, zone);
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
    people: poll.people.filter(p => p.startsWith("mbr_")).map(p => ({ id: p, name: nameOf(picked.get(p), locale) })),
    closes: poll.closesAt ? local(poll.closesAt, zone) : null,
    slots: poll.slots,
    repeat: poll.repeat,
  };
  return (
    <div className="narrow centred">
      <Composer
        mode={poll.status === "draft" ? "draft" : "open"}
        pollId={poll.id}
        initial={initial}
        groups={await groups()}
        today={chestToday()}
        monthNames={d.monthNames()}
        weekdayNames={d.weekdayNames()}
        locale={locale}
        round={poll.seriesId !== null}
        t={{ composer: t.composer, kinds: t.kinds, errors: t.errors, repeat: t.repeat, date: t.date, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
