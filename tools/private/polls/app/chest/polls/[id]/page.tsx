import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back, CalendarPlus, Clock, Eye, Info, KindIcon, Mask, People } from "../../../../components/icons.tsx";
import { all, groups as chestGroups } from "../../../../lib/audience.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { dates, optionText } from "../../../../lib/dates.ts";
import { db } from "../../../../lib/db.ts";
import { format, plural } from "../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { view, type PollView } from "../../../../lib/polls.ts";
import { viewer } from "../../../../lib/session.ts";
import { catchUp } from "../../../../lib/tell.ts";
import { AnswerArea, type AnswerQuestion } from "./answer-area.tsx";
import { FinalPicker, Manage } from "./manage.tsx";
import { Results, type DateLabel, type Named } from "./results.tsx";

// A poll: what it asks, the answer form, the results when they show, and
// for its organiser the participation and the controls.
export default async function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const { id } = await params;
  const sql = db();
  await catchUp(sql).catch(() => undefined);
  let pv: PollView;
  try {
    pv = await view(sql, member, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
  const { poll } = pv;
  if (poll.status === "draft") redirect(`/chest/polls/${poll.id}/edit`);

  const d = dates(locale, zone);
  const range = { range: t.dates.range, dayAndTime: t.dates.dayAndTime };
  const single = poll.kind !== "survey";

  // Who is asked, now (the Chest's members), and who has not answered yet.
  const audience = await all(poll);
  const total = Math.max(audience.people.length, pv.answers);
  const showMissing = pv.manages && !poll.anonymous && poll.status === "open";
  const missing = showMissing ? audience.people.filter(p => !pv.participants.includes(p.id)) : [];

  // Names: the organiser, the participants, those not answered yet.
  const ids = new Set<string>([poll.organiser, ...pv.participants]);
  for (const q of pv.results ?? []) {
    if (q.kind === "date") for (const row of q.grid) ids.add(row.member);
    if (q.kind === "text") for (const x of q.texts) if (x.member) ids.add(x.member);
    if (q.kind === "choice") {
      for (const o of q.options) for (const m of o.voters) ids.add(m);
      for (const x of q.other?.texts ?? []) if (x.member) ids.add(x.member);
    }
    if (q.kind === "scale") for (const c of q.counts) for (const m of c.voters) ids.add(m);
  }
  const found = await people(ids);
  const names: Named = new Map([...ids].map(i => [i, { name: i === member.id ? t.people.you : nameOf(found.get(i), locale), photo: found.get(i)?.photo ?? null }]));
  if (!names.has("erased")) names.set("erased", { name: t.people.erased, photo: null });

  const dateLabels = new Map<string, DateLabel>();
  for (const q of poll.questions) for (const o of q.options) {
    if (!o.day) continue;
    dateLabels.set(o.id, { month: d.month(o.day), day: d.dayNumber(o.day), weekday: d.weekday(o.day), text: d.dayLong(o.day), hours: d.hours({ day: o.day, start: o.start, end: o.end }, t.dates.range) || t.dates.allDay });
  }
  const questions: AnswerQuestion[] = poll.questions.map(q => ({
    id: q.id, kind: q.kind, text: q.text || poll.title, multiple: q.multiple, other: q.other, low: q.low, high: q.high,
    options: q.options.map(o => ({ id: o.id, label: o.label, date: dateLabels.get(o.id) ?? null })),
  }));

  // What I answered, in a few words (a named poll).
  const said: string[] = [];
  if (pv.mine && single) {
    const q = poll.questions[0]!;
    const a = pv.mine[q.id];
    if (a && q.kind === "choice") said.push(...q.options.filter(o => a.options.includes(o.id)).map(o => o.label), ...(a.other ? [a.other] : []));
    if (a && q.kind === "date") for (const o of q.options) {
      const value = a.dates[o.id];
      if (value === 2 || value === 1) said.push(`${d.dayShort(o.day!)}${o.start ? " " + o.start : ""} · ${value === 2 ? t.poll.yes : t.poll.maybe}`);
    }
  }

  const organiserName = nameOf(found.get(poll.organiser), locale);
  const groupNames = poll.everyone ? [] : ((await chestGroups()) ?? []).filter(g => poll.groups.includes(g.id)).map(g => g.name);
  const to = poll.everyone ? t.poll.toEveryone : groupNames.length > 0 ? new Intl.ListFormat(locale, { type: "conjunction" }).format(groupNames) : t.poll.toEveryone;
  const final = poll.finalOption ? poll.questions[0]?.options.find(o => o.id === poll.finalOption) : undefined;
  const dateResult = pv.results?.find(q => q.kind === "date");
  const canAnswer = poll.status === "open" && pv.asked;

  return (
    <>
      {poll.status === "open" && <AutoRefresh seconds={20} />}
      <a className="back" href="/chest"><Back />{t.shell.home}</a>
      <header className="poll-head">
        <div className="row">
          <span className={"chip " + poll.kind}><KindIcon kind={poll.kind} />{t.kinds[poll.kind].chip}</span>
          {poll.anonymous && <span className="chip quiet"><Mask />{t.home.anonymous}</span>}
        </div>
        <h1>{poll.title}</h1>
        {poll.details && <p className="details">{poll.details}</p>}
        <div className="meta">
          <span>{poll.organiser === member.id ? t.poll.byYou : format(t.poll.by, { name: organiserName })}</span>
          <span><People />{format(t.poll.askedTo, { who: to })}</span>
          <span><Clock />{poll.status === "closed" ? format(t.poll.closedOn, { date: d.at(poll.closedAt!) }) : poll.closesAt ? format(t.poll.closes, { date: d.at(poll.closesAt) }) : t.poll.noClose}</span>
        </div>
      </header>

      <div className="layout with-side">
        <div className="stack">
          {final && (
            <div className="final-card">
              <span className="eyebrow">{t.final.chosen}</span>
              <strong>{optionText({ day: final.day!, start: final.start, end: final.end }, locale, zone, range)}</strong>
              {!pv.manages && <div className="row"><a className="button small" href={`/chest/polls/${poll.id}/calendar`} download><CalendarPlus />{t.final.calendar}</a></div>}
            </div>
          )}
          {poll.status === "closed" && !final && <p className="note"><Info />{poll.kind === "date" && !pv.manages ? t.final.waiting : t.poll.closed}</p>}
          {poll.status === "open" && !pv.asked && <p className="note"><Info />{t.poll.notAsked}</p>}
          {canAnswer && <p className={"note" + (poll.anonymous ? " anon" : "")}>{poll.anonymous ? <Mask /> : <Eye />}{poll.anonymous ? t.poll.anonymous : t.poll.named}</p>}

          {canAnswer && (
            <AnswerArea
              pollId={poll.id}
              questions={questions}
              single={single}
              anonymous={poll.anonymous}
              answered={pv.answered}
              mine={pv.mine}
              changeNote={poll.closesAt ? format(t.poll.changeUntil, { date: d.at(poll.closesAt) }) : t.poll.changeAnyTime}
              said={said}
              t={{ poll: t.poll, errors: t.errors }}
            />
          )}

          <section className="card results-card" aria-labelledby="results">
            <h2 id="results">{t.results.title}</h2>
            {pv.state === "shown" && pv.results ? (
              <Results results={pv.results} single={single} names={pv.names ? names : null} dateLabels={dateLabels} finalOption={poll.finalOption} locale={locale} t={t} />
            ) : pv.state === "threshold" ? (
              <div className="threshold">
                <Mask />
                <strong>{t.results.threshold}</strong>
                <span className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < pv.answers ? "on" : ""} />)}</span>
                <span>{plural(t.results.thresholdCount, pv.answers, locale)}</span>
              </div>
            ) : (
              <p className="note"><Clock />{t.poll.resultsAfter}</p>
            )}
          </section>
        </div>

        <aside className="side">
          <section className="card participation" aria-labelledby="participation">
            <h2 id="participation" className="visually-hidden">{t.results.title}</h2>
            <div className="numbers"><strong>{pv.answers}</strong><span>{format(t.results.ofTotal, { total })}</span></div>
            <div className="meter" role="img" aria-label={format(t.results.of, { count: pv.answers, total })}><i style={{ ["--w" as string]: Math.round((pv.answers * 100) / Math.max(total, 1)) + "%" }} /></div>
            {showMissing && (missing.length === 0 ? <p className="hint">{t.results.everyoneAnswered}</p> : (
              <>
                <p className="label">{t.results.notYet}</p>
                <ul className="people-list">
                  {missing.slice(0, 40).map(p => <li key={p.id}><Avatar name={p.name} photo={found.get(p.id)?.photo ?? null} size={24} />{p.id === member.id ? t.people.you : p.name}</li>)}
                  {missing.length > 40 && <li>{plural(t.people.more, missing.length - 40, locale)}</li>}
                </ul>
              </>
            ))}
          </section>

          {pv.manages && (
            <section className="card" aria-labelledby="organise">
              <h2 id="organise">{t.manage.title}</h2>
              {poll.kind === "date" && poll.status === "closed" && (
                <div className="stack-gap">
                  <FinalPicker
                    pollId={poll.id}
                    chosen={poll.finalOption}
                    tally={t.results.yesMaybe}
                    options={(poll.questions[0]?.options ?? []).map(o => {
                      const counted = dateResult?.kind === "date" ? dateResult.options.find(x => x.id === o.id) : undefined;
                      return { id: o.id, text: optionText({ day: o.day!, start: o.start, end: o.end }, locale, zone, range), yes: counted?.yes ?? null, maybe: counted?.maybe ?? null, best: counted?.best ?? false };
                    })}
                    t={{ manage: t.manage, final: t.final, errors: t.errors }}
                  />
                </div>
              )}
              <Manage pollId={poll.id} status={poll.status} canEdit={pv.edits} canExport={pv.state === "shown"} canReopen={poll.finalOption === null} t={{ manage: t.manage, final: t.final, errors: t.errors }} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
