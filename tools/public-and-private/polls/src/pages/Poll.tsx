import type { Member } from "@argentic/chest-sdk/member";
import { Avatar, StatusBadge } from "@argentic/chest-ui/components";
import { Back, CalendarPlus, Clock, Eye, Info, KindIcon, Mask, Pencil, People, Repeat } from "../components/icons.tsx";
import type { View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { log } from "@argentic/chest-app";
import { AppError, notFound, redirect } from "@argentic/chest-app";
import { fill as format, listOf, type Catalogue, type Format, type Locale } from "../i18n/index.ts";
import { calendarPage, guestMailOffered, inCalendar, learned, notInCalendar } from "../lib/agenda.ts";
import { all, groups as chestGroups } from "../lib/audience.ts";
import { canComment, list as listComments } from "../lib/comments.ts";
import { dates, optionText } from "../lib/dates.ts";
import type { Sql } from "../lib/db.ts";
import { guestLink, guests as listGuests } from "../lib/guests.ts";
import { nameOf, people } from "../lib/people.ts";
import { guestNames, view, type PollView } from "../lib/polls.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { conversations } from "../lib/replies.ts";
import { seriesState, trend } from "../lib/series.ts";
import { teamResults } from "../lib/teams.ts";
import { catchUp } from "../lib/tell.ts";
import { local } from "../lib/time.ts";
import { chestZone } from "../lib/zone.ts";
import { percentClass } from "./bits.tsx";
import { Results, type DateLabel, type Named, type ShownReply } from "./Results.tsx";
import { TeamsCard } from "./Teams.tsx";
import { TrendCard } from "./Trend.tsx";

// A question of the answer form, as the AnswerArea island receives it.
type AnswerQuestion = { id: string; kind: "choice" | "date" | "scale" | "text" | "enps"; text: string; multiple: boolean; other: boolean; low: string; high: string; options: { id: string; label: string; date: DateLabel | null }[] };

// A poll, /chest/polls/<id>: what it asks, the answer form, the results
// when they show, and for its organiser the participation and the
// controls. It re-reads itself every 20 s while it is open.
export async function pollPage({ sql, member, locale, t, f, request }: { sql: Sql; member: Member; locale: Locale; t: Catalogue; f: Format; request: Request }, id: string): Promise<View> {
  const zone = chestZone();
  // The work a schedule would do, on a visit: Polls works without one.
  await catchUp(sql).catch(error => log.error("catch-up failed", error));
  let pv: PollView;
  try {
    pv = await view(sql, member, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden" || error.code === "invalid")) notFound();
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

  // Comments (named polls), and a pulse survey's rounds over time.
  const notes = poll.anonymous ? [] : await listComments(sql, member, poll.id);
  const series = await seriesState(sql, poll.seriesId);
  const lines = poll.seriesId ? await trend(sql, member, poll) : [];
  // An anonymous survey per team, once its results show (lib/teams.ts).
  const byTeam = poll.anonymous && poll.kind === "survey" && pv.state === "shown" ? await teamResults(sql, member, poll.id) : null;
  const roundLabels = new Map<string, string>();
  for (const line of lines) for (const p of line.points) { const day = local(p.openedAt, zone).day; roundLabels.set(p.pollId, d.dayNumber(day) + " " + d.month(day)); }

  // Names: the organiser, the participants, those not answered yet, the
  // authors of comments.
  const ids = new Set<string>([poll.organiser, ...pv.participants, ...notes.map(c => c.author), ...poll.people.slice(0, 5)]);
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
  // Guests from outside the Chest (a date poll's link): the names they typed.
  if (pv.guests > 0 && pv.names) for (const [key, name] of await guestNames(sql, poll.id)) names.set(key, { name, photo: null, guest: true });
  const guestsShown = pv.manages && poll.kind === "date" && !poll.anonymous;
  const link = guestsShown ? await guestLink(sql, poll.id) : null;
  const origin = link ? publicOrigin(request.headers) : null;
  const guestList = guestsShown ? await listGuests(sql, member, poll) : [];
  // Whether guests hear the chosen date by email (the guests' form asks
  // their address only then); a sign-up sheet has no date to choose.
  const guestMail = guestsShown && link !== null && poll.slots === null ? ((await guestMailOffered()) ? "on" : "off") : null;
  // The chosen date in this member's Chest calendar (Proposal (studio)).
  // Replies to anonymous free texts, for those who manage a closed survey.
  const talks = poll.anonymous && pv.state === "shown" && pv.results?.some(q => q.kind === "text") ? await conversations(sql, member, poll) : null;
  let threads: Map<number, ShownReply[]> | null = null;
  if (talks) {
    const writers = await people([...talks.values()].flat().map(r => r.author));
    threads = new Map([...talks].map(([at, list]) => [at, list.map(r => ({ id: r.id, name: r.author === "anonymous" ? null : r.author === member.id ? t.people.you : nameOf(writers.get(r.author), locale), body: r.body }))]));
  }
  const inMine = poll.finalOption !== null && (await learned(sql)) === "on" && (await inCalendar(sql, poll)).includes(member.id) && !(await notInCalendar(sql, poll.id)).has(member.id);

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
  // Groups by name, then people picked by name (the first five, then "N more").
  const picked = poll.people.slice(0, 5).map(p => names.get(p)?.name ?? t.people.unknown);
  const audienceWords = [...groupNames, ...picked, ...(poll.people.length > 5 ? [f.plural(t.people.more, poll.people.length - 5)] : [])];
  const to = poll.everyone || audienceWords.length === 0 ? t.poll.toEveryone : listOf(locale, audienceWords);
  const final = poll.finalOption ? poll.questions[0]?.options.find(o => o.id === poll.finalOption) : undefined;
  const dateResult = pv.results?.find(q => q.kind === "date");
  const canAnswer = poll.status === "open" && pv.asked;

  return { title: poll.title, body: (
    <>
      {poll.status === "open" && <Island name="AutoRefresh" props={{ seconds: 20 }} />}
      <a className="back" href="/chest"><Back />{t.shell.home}</a>
      <header className="poll-head">
        <div className="row">
          <span className={"chip " + poll.kind}><KindIcon kind={poll.kind} />{t.kinds[poll.kind].chip}</span>
          {poll.anonymous && <StatusBadge tone="neutral" size="s" icon={<Mask />} label={t.home.anonymous} />}
        </div>
        <h1>{poll.title}</h1>
        {poll.details && <p className="details">{poll.details}</p>}
        <div className="meta">
          <span>{poll.organiser === member.id ? t.poll.byYou : format(t.poll.by, { name: organiserName })}</span>
          <span><People />{format(t.poll.askedTo, { who: to })}</span>
          <span><Clock />{poll.status === "closed" ? format(t.poll.closedOn, { date: d.at(poll.closedAt!) }) : poll.closesAt ? format(t.poll.closes, { date: d.at(poll.closesAt) }) : t.poll.noClose}</span>
          {series && poll.round !== null && <span><Repeat />{format(t.poll.round, { round: poll.round, every: t.repeat[series.every] })}{" · "}{series.nextAt ? format(t.poll.nextRound, { date: d.at(series.nextAt) }) : t.poll.noMoreRounds}</span>}
          {poll.editedAfter !== null && <span><Pencil />{f.plural(t.poll.editedAfter, poll.editedAfter)}</span>}
        </div>
      </header>

      <div className="layout with-side">
        <div className="stack">
          {final && (
            <div className="final-card">
              <span className="eyebrow">{t.final.chosen}</span>
              <strong>{optionText({ day: final.day!, start: final.start, end: final.end }, locale, zone, range)}</strong>
              {(!pv.manages || inMine) && (
                <div className="row">
                  {inMine && <a className="button small" href={calendarPage}><CalendarPlus />{t.final.inCalendar}</a>}
                  {!pv.manages && <a className={inMine ? "button link" : "button small"} href={`/chest/polls/${poll.id}/calendar`} download>{inMine ? t.final.file : <><CalendarPlus />{t.final.calendar}</>}</a>}
                </div>
              )}
            </div>
          )}
          {poll.status === "closed" && !final && <p className="note"><Info />{poll.kind === "date" && !pv.manages ? t.final.waiting : t.poll.closed}</p>}
          {poll.status === "open" && !pv.asked && <p className="note"><Info />{t.poll.notAsked}</p>}
          {canAnswer && <p className={"note" + (poll.anonymous ? " anon" : "")}>{poll.anonymous ? <Mask /> : <Eye />}{poll.anonymous ? t.poll.anonymous : t.poll.named}</p>}

          {canAnswer && (
            <Island name="AnswerArea" props={{
              pollId: poll.id,
              questions,
              single,
              anonymous: poll.anonymous,
              answered: pv.answered,
              mine: pv.mine,
              changeNote: poll.closesAt ? format(t.poll.changeUntil, { date: d.at(poll.closesAt) }) : t.poll.changeAnyTime,
              said,
              slots: poll.slots,
              taken: pv.taken,
              locale,
              t: { poll: t.poll },
            }} />
          )}

          {poll.anonymous && pv.state === "shown" && !pv.manages && <Island name="MyReplies" props={{ pollId: poll.id, t: { replies: t.replies } }} />}

          <section className="card results-card" aria-labelledby="results">
            <h2 id="results">{t.results.title}</h2>
            {pv.state === "shown" && pv.results ? (
              <Results results={pv.results} single={single} names={pv.names ? names : null} dateLabels={dateLabels} finalOption={poll.finalOption} slots={poll.slots} f={f} t={t} threads={threads ? { pollId: poll.id, map: threads } : null} />
            ) : pv.state === "threshold" ? (
              <div className="threshold">
                <Mask />
                <strong>{t.results.threshold}</strong>
                <span className="dots" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < pv.answers ? "on" : ""} />)}</span>
                <span>{f.plural(t.results.thresholdCount, pv.answers)}</span>
              </div>
            ) : poll.anonymous ? (
              <p className="note anon"><Mask />{t.poll.resultsAfterAnonymous}</p>
            ) : (
              <p className="note"><Clock />{t.poll.resultsAfter}</p>
            )}
          </section>

          {byTeam && <TeamsCard teams={byTeam.teams} hidden={byTeam.hidden} f={f} t={t} />}

          {lines.length > 0 && <TrendCard trend={lines} labels={roundLabels} f={f} t={t} />}

          {!poll.anonymous && (
            <Island name="Comments" props={{
              pollId: poll.id,
              comments: notes.map(c => ({ id: c.id, name: names.get(c.author)?.name ?? t.people.unknown, photo: names.get(c.author)?.photo ?? null, when: d.ago(c.createdAt), body: c.body, removable: c.removable })),
              canWrite: canComment(member, poll),
              t: { comments: t.comments },
            }} />
          )}
        </div>

        <aside className="side">
          <section className="card participation" aria-labelledby="participation">
            <h2 id="participation" className="visually-hidden">{t.results.title}</h2>
            <div className="numbers"><strong>{pv.answers}</strong><span>{format(t.results.ofTotal, { total })}</span></div>
            <div className="meter" role="img" aria-label={format(t.results.of, { count: pv.answers, total })}><i className={percentClass((pv.answers * 100) / Math.max(total, 1))} /></div>
            {pv.guests > 0 && <p className="hint">{f.plural(t.guests.andGuests, pv.guests)}</p>}
            {showMissing && (missing.length === 0 ? <p className="hint">{t.results.everyoneAnswered}</p> : (
              <>
                <p className="label">{t.results.notYet}</p>
                <ul className="people-list">
                  {missing.slice(0, 40).map(p => <li key={p.id}><Avatar name={p.name} photo={found.get(p.id)?.photo ?? null} size="s" />{p.id === member.id ? t.people.you : p.name}</li>)}
                  {missing.length > 40 && <li>{f.plural(t.people.more, missing.length - 40)}</li>}
                </ul>
              </>
            ))}
          </section>

          {guestsShown && (poll.status === "open" || link !== null || guestList.length > 0) && (
            <Island name="GuestsCard" props={{ pollId: poll.id, url: link && origin ? `${origin}/p/${link}` : null, open: poll.status === "open", list: guestList, mail: guestMail, locale, t: { guests: t.guests } }} />
          )}

          {pv.manages && (
            <section className="card" aria-labelledby="organise">
              <h2 id="organise">{t.manage.title}</h2>
              {poll.kind === "date" && poll.status === "closed" && (
                <div className="stack-gap">
                  <Island name="FinalPicker" props={{
                    pollId: poll.id,
                    chosen: poll.finalOption,
                    tally: t.results.yesMaybe,
                    options: (poll.questions[0]?.options ?? []).map(o => {
                      const counted = dateResult?.kind === "date" ? dateResult.options.find(x => x.id === o.id) : undefined;
                      return { id: o.id, text: optionText({ day: o.day!, start: o.start, end: o.end }, locale, zone, range), yes: counted?.yes ?? null, maybe: counted?.maybe ?? null, best: counted?.best ?? false };
                    }),
                    t: { manage: t.manage, final: t.final },
                  }} />
                </div>
              )}
              <Island name="Manage" props={{
                pollId: poll.id,
                status: poll.status,
                anonymous: poll.anonymous,
                canEdit: pv.edits,
                canExport: pv.state === "shown",
                canReopen: poll.finalOption === null && !poll.anonymous && poll.seriesId === null,
                canNudge: poll.status === "open" && pv.answers < total,
                series: series ? { stopped: series.stopped } : null,
                t: { manage: t.manage, final: t.final },
              }} />
            </section>
          )}
        </aside>
      </div>
    </>
  ) };
}
