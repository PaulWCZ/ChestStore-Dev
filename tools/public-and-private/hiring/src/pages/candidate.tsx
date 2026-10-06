import { chest } from "@argentic/chest-sdk/chest";
import { after, Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { StatusBadge } from "@argentic/chest-ui/components";
import { Back, Download, External, Link as LinkIcon, Mail, Phone, Star } from "../components/icons.tsx";
import { catalogue, localeOf, locales, type Catalogue, type Locale } from "../i18n/index.ts";
import { candidate as readCandidate, type Activity, type Feedback } from "../lib/candidates.ts";
import { db } from "../lib/db.ts";
import { ofCandidate } from "../lib/interviews.ts";
import { interviewersOf, settings } from "../lib/jobs.ts";
import { mailState } from "../lib/mail-state.ts";
import { rejectionDraft, values as mailValues } from "../lib/mailer.ts";
import { conversation, templates as companyTemplates, type Message } from "../lib/messages.ts";
import { nameOf, people } from "../lib/people.ts";
import { ofCandidate as linksOf } from "../lib/self-schedule.ts";
import * as tell from "../lib/tell.ts";
import { teammates } from "../lib/team.ts";
import { dayLabel, fileSize, format, formatDate, languageNames, meetingTime, numberText, plural, zoneName } from "../shared/format.ts";
import { isPictureCv } from "../shared/model.ts";
import { labelOf, stageLabel } from "../shared/stages.ts";
import { dayOf } from "../shared/time.ts";

// What a candidate's page shows, in a few characters: the candidate's last
// news (a note, feedback, an email, a move: each touches it), their
// interviews and links, the feedback asked.
export async function candidateVersion(ctx: PageContext<MemberContext>): Promise<string | null> {
  const id = ctx.param("id");
  if (!/^[1-9][0-9]{0,17}$/u.test(id)) return null;
  const [row] = await db()<{ v: string | null }[]>`
    select md5(concat_ws('|',
      (select concat_ws(':', stage_id, status, last_activity_at, name, email, phone, link, language, pool_at, cv_object, start_date) from candidates where id = ${id}),
      (select count(*)::text || max(created_at)::text from notes where candidate_id = ${id}),
      (select count(*)::text || max(updated_at)::text from feedback where candidate_id = ${id}),
      (select string_agg(member_id, ',' order by member_id) from feedback_requests where candidate_id = ${id}),
      (select string_agg(id || status || coalesce(sent_at::text, ''), ',' order by id) from messages where candidate_id = ${id}),
      (select string_agg(id || updated_at::text, ',' order by id) from interviews where candidate_id = ${id}),
      (select string_agg(id || coalesce(booked_at::text, '') || coalesce(cancelled_at::text, ''), ',' order by id) from interview_requests where candidate_id = ${id}),
      (select count(*)::text from activity where candidate_id = ${id}))) as v`;
  return row?.v ?? null;
}

// One candidate: who they are, their CV and answers, what the team thinks,
// the emails, the interviews, what happened. A recruiter moves them on,
// writes to them, invites them from here; an interviewer gives their
// feedback. Dates and times in the reader's own zone; the interview form's
// times in the Chest's (it says so).
export async function candidatePage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t, member, f } = ctx;
  const locale = localeOf(ctx.locale);
  const zone = f.timeZone;
  const sql = db();
  const d = await readCandidate(sql, member, ctx.param("id"));
  const c = d.candidate;
  const manage = d.access === "manage";
  // Opened by a recruiter: their bell item about them goes, the tile's
  // number with it (once the page is answered).
  if (manage) after("opened", async () => {
    await tell.opened(member, c.id);
    await tell.refreshBadges(db());
  });
  const s = await settings(sql);
  const onJob = await interviewersOf(sql, c.jobId);
  // Whether an email to the candidate would leave: the forms say so
  // before a recruiter counts on one.
  const mailing = manage ? await mailState() : "unknown";
  const [mails, meetings, own, requests] = await Promise.all([
    manage ? conversation(sql, member, c.id) : Promise.resolve([]),
    ofCandidate(sql, member, c.id),
    manage ? companyTemplates(sql, member) : Promise.resolve([]),
    manage ? linksOf(sql, member, c.id) : Promise.resolve([]),
  ]);
  // The links waiting for the candidate to choose a time.
  const waiting = requests.filter(r => r.status === "open");
  const ids = [
    ...d.notes.map(n => n.author), ...d.others.map(x => x.author), ...d.asked, ...onJob, ...(c.addedBy ? [c.addedBy] : []),
    ...d.activity.flatMap(a => [a.actor ?? "", ...(Array.isArray(a.data["members"]) ? (a.data["members"] as string[]) : []), ...(Array.isArray(a.data["people"]) ? (a.data["people"] as string[]) : [])]),
    ...mails.map(m => m.author ?? ""), ...meetings.flatMap(m => m.people), ...waiting.flatMap(r => r.people),
  ];
  const who = await people(ids);
  const name = (id: string | null) => (id === member.id ? member.name : nameOf(who.get(id ?? ""), locale));
  const defaults = t.jobSettings.defaults;
  const stage = d.stages.find(x => x.id === c.stageId);
  const next = d.stages[d.stages.findIndex(x => x.id === c.stageId) + 1];
  const kept = new Date(c.lastActivityAt);
  kept.setUTCMonth(kept.getUTCMonth() + s.retentionMonths);
  const day = (value: string) => formatDate(value, locale, zone, { day: "numeric", month: "long", year: "numeric" });
  const when = (value: string) => formatDate(value, locale, zone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  // Whom a recruiter may ask, or invite: the job's interviewers and the
  // recruiters (not themselves for feedback; not those who gave theirs).
  const gave = new Set([...d.others.map(x => x.author), ...(d.mine ? [member.id] : [])]);
  const team = manage ? await teammates() : [];
  const eligible = team.filter(m => onJob.includes(m.id) || m.role === "recruiter");
  const askable = eligible.filter(m => m.id !== member.id && !gave.has(m.id)).map(m => ({ id: m.id, name: m.name, asked: d.asked.includes(m.id) }));
  const sender = member.firstName || member.name;
  const draft = rejectionDraft(c, d.job, s.companyName, sender);
  const isPdf = c.cv?.type === "application/pdf";
  // A photo of a CV (taken with a phone) shows as an image.
  const isPicture = isPictureCv(c.cv?.type);
  const tc = t.candidate;
  const status = c.status === "rejected" ? format(tc.rejectedLine, { reason: c.rejectReason ? t.reject.reasons[c.rejectReason] : "" }) : stage?.hired ? tc.hiredLine : stageLabel(stage, defaults);
  // The templates a recruiter starts from: the tool's own in each language
  // (the candidate's first), then the company's.
  const values = mailValues(c, d.job, s.companyName, sender);
  const builtIn = [c.language, ...locales.filter(l => l !== c.language)].flatMap(l => {
    const w = catalogue(l).templates;
    return (["availability", "followUp", "offer", "reject"] as const).map(k => ({ id: `${k}:${l}`, name: w[k].name, language: l, subject: w[k].subject, body: w[k].body }));
  });
  const chestZone = chest.timeZone;
  // Jobs this person could be proposed for: open or draft, not this one.
  const otherJobs = manage ? await sql<{ id: string; title: string }[]>`select id, title from jobs where state != 'closed' and id != ${c.jobId} order by title limit 200` : [];
  const upload = { invalid: t.errors.file_invalid, tooLarge: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit };

  return {
    title: c.name,
    body: (
      <div className="candidate-page">
        <a className="back-link" href={`/chest/jobs/${c.jobId}`}><Back />{format(tc.back, { job: d.job.title })}</a>
        <header className="cand-head">
          <div className="cand-title">
            <h1>{c.name}</h1>
            <StatusBadge tone={c.status === "rejected" ? "danger" : stage?.hired ? "ok" : "info"} label={status} />
            {c.poolAt && <StatusBadge tone="neutral" icon={<Star />} label={tc.inPool} />}
          </div>
          <p className="muted">
            {c.source === "careers" ? format(tc.applied, { date: day(c.createdAt) }) : c.source === "import" ? format(tc.importedFrom, { origin: c.origin || tc.anotherTool, date: day(c.createdAt) }) : format(tc.addedBy, { name: name(c.addedBy), date: day(c.createdAt) })}
            {" · "}{d.job.title}
            {c.status === "active" && stage?.hired && c.startDate && <>{" · "}<strong>{format(t.hire.startsOn, { date: dayLabel(c.startDate, locale, { day: "numeric", month: "long", year: "numeric" }) })}</strong></>}
          </p>
          {manage && (
            <Island id={`actions-${c.id}`} name="CandidateActions" props={{
              jobId: c.jobId,
              candidate: { id: c.id, name: c.name, status: c.status, stageId: c.stageId, email: c.email, phone: c.phone, link: c.link, language: c.language, inPool: c.poolAt !== null },
              stages: d.stages.map(x => ({ id: x.id, name: stageLabel(x, defaults), hired: x.hired })),
              next: c.status === "active" && next ? { id: next.id, name: stageLabel(next, defaults) } : null,
              askable, draft: draft.text, languageName: languageNames[c.language] ?? c.language, locale,
              write: { templates: [...builtIn, ...own.map(x => ({ id: x.id, name: x.name, language: x.language, subject: x.subject, body: x.body, attachments: x.attachments.map(a => ({ file: a.file, name: a.name, type: a.type, size: a.size })) }))], values, languageNames },
              // Ticked at first: the job's own interviewers — never the
              // recruiter silently (the button then names who is on it).
              interview: { people: eligible.map(m => ({ id: m.id, name: m.name })), preselected: eligible.filter(m => onJob.includes(m.id)).map(m => m.id), today: dayOf(new Date(), chestZone), zone: zoneName(chestZone) },
              jobs: otherJobs.map(j => ({ id: String(j.id), title: j.title })),
              mailing,
              t: { candidate: tc, reject: t.reject, common: t.common, apply: t.apply, board: t.board, hire: t.hire, write: t.write, interview: t.interview, dialog: t.kit.dialog, date: t.kit.date, files: t.kit.files, upload },
            }} />
          )}
        </header>

        <div className="cand-grid">
          <div className="cand-main">
            {d.access === "interview" && c.status === "active" && (
              <section className="panel feedback-panel" aria-labelledby="your-feedback">
                <h2 id="your-feedback">{tc.yourFeedback}</h2>
                <Island id={`feedback-${c.id}`} name="FeedbackForm" props={{ candidateId: c.id, mine: d.mine, t: { candidate: tc, empty: t.errors.empty } }} />
              </section>
            )}

            <section className="panel" aria-labelledby="cv">
              <div className="panel-head">
                <h2 id="cv">{tc.cv}</h2>
                {c.cv && (
                  <span className="panel-actions">
                    {(isPdf || isPicture) && <a className="button quiet small" href={`/chest/candidates/${c.id}/cv`} target="_blank" rel="noopener"><External />{tc.openCv}</a>}
                    <a className="button quiet small" href={`/chest/candidates/${c.id}/cv?download`} download><Download />{tc.downloadCv}</a>
                  </span>
                )}
              </div>
              {c.cv ? (
                <>
                  <p className="muted small">{c.cv.fileName} · {fileSize(c.cv.size, locale)}</p>
                  {isPdf && <iframe className="cv-frame" src={`/chest/candidates/${c.id}/cv`} title={tc.cvPreview} loading="lazy" />}
                  {isPicture && <img className="cv-picture" src={`/chest/candidates/${c.id}/cv`} alt={tc.cvPreview} loading="lazy" />}
                </>
              ) : <p className="muted">{tc.noCv}</p>}
              {c.answers.length > 0 && (
                <div className="cover">
                  <h3>{tc.answers}</h3>
                  <dl className="answers">
                    {c.answers.map(a => <div key={a.id}><dt>{a.label}</dt><dd className="pre">{a.answer === "yes" ? t.apply.yes : a.answer === "no" ? t.apply.no : a.answer}</dd></div>)}
                  </dl>
                </div>
              )}
              {c.coverLetter && (
                <div className="cover">
                  <h3>{tc.coverLetter}</h3>
                  <p className="pre">{c.coverLetter}</p>
                </div>
              )}
            </section>

            {manage && (
              <section className="panel" aria-labelledby="emails">
                <h2 id="emails">{t.write.emails}</h2>
                <Conversation messages={mails.map(m => ({ ...m, authorName: m.author ? name(m.author) : m.kind === "confirmation" ? t.write.automatic : "", when: when(m.createdAt) }))} candidate={{ name: c.name }} locale={locale} t={t} />
              </section>
            )}

            <section className="panel" aria-labelledby="feedback">
              <div className="panel-head"><h2 id="feedback">{tc.feedback}</h2></div>
              {manage && d.asked.length > 0 && <p className="muted small">{format(tc.waitingFor, { names: d.asked.map(a => name(a)).join(", ") })}</p>}
              <FeedbackList mine={d.mine ? { ...d.mine, authorName: name(member.id) } : null} others={d.others.map(x => ({ ...x, authorName: name(x.author) }))} hidden={d.othersHidden} locale={locale} t={t} />
              {manage && c.status === "active" && (
                <details className="own-feedback">
                  <summary className="button quiet small">{d.mine ? tc.updateFeedback : tc.yourFeedback}</summary>
                  <Island id={`feedback-${c.id}`} name="FeedbackForm" props={{ candidateId: c.id, mine: d.mine, t: { candidate: tc, empty: t.errors.empty } }} />
                </details>
              )}
            </section>

            <section className="panel" aria-labelledby="notes">
              <h2 id="notes">{tc.notes}</h2>
              <Island id={`notes-${c.id}`} name="Notes" props={{
                candidateId: c.id,
                notes: d.notes.map(n => ({ id: n.id, body: n.body, authorName: name(n.author), when: when(n.at), mine: n.author === member.id })),
                canWrite: manage, t: { candidate: tc },
              }} />
            </section>
          </div>

          <aside className="cand-side">
            {(meetings.length > 0 || waiting.length > 0 || manage) && (
              <section className="panel" aria-labelledby="interviews">
                <h2 id="interviews">{t.interview.title}</h2>
                <Island id={`interviews-${c.id}`} name="Interviews" props={{
                  list: meetings.map(m => ({ id: m.id, when: meetingTime(m.start, zone, locale), past: new Date(m.end).getTime() < Date.now(), place: m.place, people: m.people.map(p => name(p)).join(", "), cancelled: m.cancelled, ics: m.calendar === "off" })),
                  links: waiting.map(r => ({ id: r.id, from: dayLabel(r.firstDay, locale, { weekday: "short", day: "numeric", month: "short" }), to: dayLabel(r.lastDay, locale, { weekday: "short", day: "numeric", month: "short" }), people: r.people.map(p => name(p)).join(", ") })),
                  manage, mailing, t: { interview: t.interview, common: t.common },
                }} />
              </section>
            )}

            <section className="panel" aria-labelledby="contact">
              <h2 id="contact">{tc.contact}</h2>
              <ul className="contact">
                <li><Mail /><a href={`mailto:${c.email}`}>{c.email}</a></li>
                {c.phone && <li><Phone /><a href={`tel:${c.phone.replace(/[^+0-9]/gu, "")}`}>{c.phone}</a></li>}
                {c.link && <li><LinkIcon /><a href={c.link} target="_blank" rel="noopener noreferrer nofollow">{c.link.replace(/^https?:\/\/(www\.)?/u, "").replace(/\/$/u, "")}</a></li>}
              </ul>
              <dl className="facts-list">
                <div><dt>{tc.language}</dt><dd>{languageNames[c.language] ?? c.language}</dd></div>
                <div><dt>{t.export.headers.source}</dt><dd>{tc.source[c.source]}{c.origin ? ` · ${c.origin}` : ""}</dd></div>
              </dl>
              {c.poolAt && <p className="muted small">{format(tc.poolSince, { date: day(c.poolAt) })}</p>}
              <p className="muted small">{format(tc.keptUntil, { date: day(kept.toISOString()) })}</p>
            </section>

            {d.elsewhere.length > 0 && (
              <section className="panel" aria-labelledby="elsewhere">
                <h2 id="elsewhere">{tc.elsewhere}</h2>
                <ul className="plain-list">
                  {d.elsewhere.map(e => (
                    <li key={e.id}><a href={`/chest/candidates/${e.id}`}>{e.jobTitle}</a> <span className="muted small">· {e.status === "rejected" ? t.export.status.rejected : stageLabel(e.stage, defaults)} · {day(e.createdAt)}</span></li>
                  ))}
                </ul>
              </section>
            )}

            <section className="panel" aria-labelledby="history">
              <h2 id="history">{tc.history}</h2>
              <ol className="timeline">
                {/* One action, one line: the email that carried a link to
                    choose a time is the link's own line. */}
                {d.activity.filter(a => !(a.kind === "wrote" && a.data["kind"] === "interview_request")).map(a => (
                  <li key={a.id} id={`event-${a.id}`}>
                    <span>{line(a, t, name, zone, locale)}</span>
                    <time dateTime={a.at} className="muted small">{when(a.at)}</time>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    ),
  };
}

// The conversation with a candidate: oldest first, the last one open.
type ShownMessage = Message & { authorName: string; when: string };
function Conversation({ messages, candidate, locale, t }: { messages: ShownMessage[]; candidate: { name: string }; locale: Locale; t: Catalogue }) {
  const w = t.write;
  if (messages.length === 0) return <p className="muted">{format(w.none, { name: candidate.name })}</p>;
  const state = (m: ShownMessage) => m.direction === "in" ? null
    : m.status === "waiting" ? <StatusBadge tone="wait" size="s" label={w.status.waiting} />
    : m.status === "sent" ? null
    : m.status === "none" ? <StatusBadge size="s" label={w.status.none} />
    : m.status === "cancelled" ? <StatusBadge size="s" label={w.status.cancelled} />
    : m.status === "bounced" ? <StatusBadge tone="danger" size="s" label={w.status.bounced} />
    : <StatusBadge tone="danger" size="s" label={w.status.failed} />;
  return (
    <ol className="mails">
      {messages.map((m, i) => (
        <li key={m.id} id={`mail-${m.id}`} className={`mail ${m.direction}`}>
          <details open={i === messages.length - 1}>
            <summary>
              <span className="mail-who">{m.direction === "in" ? (m.fromName || m.fromAddress || candidate.name) : m.authorName}</span>
              <span className="mail-subject">{m.subject || w.noSubject}</span>
              <span className="muted small">{m.when}</span>
              {state(m)}
            </summary>
            <p className="pre mail-body">{m.body}</p>
            {(m.attachments.length > 0 || (m.direction === "in" && m.hasOriginal)) && (
              <ul className="mail-files">
                {m.attachments.map((a, k) => <li key={k}><a href={`/chest/messages/${m.id}/files/${k}`} download><Download />{a.name}</a> <span className="muted small">{fileSize(a.size, locale)}</span></li>)}
                {m.direction === "in" && m.hasOriginal && <li><a href={`/chest/messages/${m.id}/files/original`} download><Download />{w.original}</a></li>}
              </ul>
            )}
            {m.direction === "in" && m.authenticated === false && <p className="hint">{w.unverified}</p>}
            {m.hasCalendar && <p className="hint">{w.withInvite}</p>}
          </details>
        </li>
      ))}
    </ol>
  );
}

// The feedback given: others' only once the reader gave theirs (or to a
// recruiter) — else how many there are.
function FeedbackList({ mine, others, hidden, locale, t }: { mine: (Feedback & { authorName: string }) | null; others: (Feedback & { authorName: string })[]; hidden: number; locale: Locale; t: Catalogue }) {
  const w = t.candidate;
  const all = [...(mine ? [mine] : []), ...others];
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  const average = all.length > 0 ? all.reduce((sum, x) => sum + x.rating, 0) / all.length : null;
  if (hidden > 0) return <p className="hidden-feedback">{plural(w.hidden, hidden, locale)}</p>;
  if (all.length === 0) return <p className="muted">{w.noFeedback}</p>;
  return (
    <>
      {average !== null && all.length > 1 && <p className="average">{format(w.average, { rating: numberText(average, locale, 1) })}</p>}
      <ul className="feedback-list">
        {all.map(x => (
          <li key={x.id} id={`fb-${x.id}`} className="feedback-card">
            <div className="feedback-head">
              <strong>{x.authorName}</strong>
              <span className={`score s-${x.rating}`}>{x.rating}/4 · {ratingWords[x.rating - 1]}</span>
              <span className={`reco-tag reco-${x.recommendation}`}>{w.recommendations[x.recommendation]}</span>
            </div>
            {x.strengths && <p><span className="fb-label">{w.strengths}</span> <span className="pre">{x.strengths}</span></p>}
            {x.concerns && <p><span className="fb-label">{w.concerns}</span> <span className="pre">{x.concerns}</span></p>}
          </li>
        ))}
      </ul>
    </>
  );
}

// One line of the history, in the reader's words (stage names too: a
// default stage reads in the reader's language), times in their zone.
function line(a: Activity, t: Catalogue, name: (id: string | null) => string, zone: string, locale: Locale): string {
  const w = t.candidate.activity;
  const actor = name(a.actor);
  const d = a.data as Record<string, unknown>;
  const defaults = t.jobSettings.defaults;
  const list = (key: string) => {
    const names = (Array.isArray(d[key]) ? (d[key] as string[]) : []).map(m => name(m));
    return names.length > 1 ? format(t.common.and, { a: names.slice(0, -1).join(", "), b: names.at(-1)! }) : names[0] ?? "";
  };
  switch (a.kind) {
    case "applied": return w.applied;
    case "added": return format(w.added, { actor });
    case "moved": return format(w.moved, { actor, from: labelOf(d["from"], d["fromPreset"], defaults), to: labelOf(d["to"], d["toPreset"], defaults) });
    case "rejected": return format(w.rejected, { actor, reason: t.reject.reasons[(d["reason"] as keyof Catalogue["reject"]["reasons"]) ?? "other"] ?? "" });
    case "restored": return format(w.restored, { actor });
    case "feedback": return format(w.feedback, { actor });
    case "asked": return format(w.asked, { actor, names: list("members") });
    case "emailed": return d["kind"] === "rejection" ? format(w.emailedRejection, { actor }) : w.emailedConfirmation;
    case "wrote": return d["kind"] === "interview_request" ? format(w.linkEmailed, { actor }) : d["kind"] === "interview" ? format(w.invited, { actor }) : d["kind"] === "interview_cancelled" ? format(w.toldCancelled, { actor }) : format(w.wrote, { actor });
    case "written_outside": return format(w.writtenOutside, { actor });
    case "replied": return d["filed"] ? format(w.filed, { actor }) : d["auto"] ? w.autoReply : w.replied;
    case "interview": return format(w.interview, { actor, when: meetingTime(String(d["at"] ?? ""), zone, locale), names: list("people") });
    case "interview_link": return format(w.interviewLink, { actor, names: list("people") });
    case "interview_link_cancelled": return format(w.interviewLinkCancelled, { actor });
    case "interview_chosen": return format(w.interviewChosen, { when: meetingTime(String(d["at"] ?? ""), zone, locale), names: list("people") });
    case "interview_rechosen": return format(w.interviewRechosen, { when: meetingTime(String(d["at"] ?? ""), zone, locale) });
    case "interview_declined": return format(w.interviewDeclined, { when: meetingTime(String(d["at"] ?? ""), zone, locale) });
    case "interview_cancelled": return format(w.interviewCancelled, { actor, when: meetingTime(String(d["at"] ?? ""), zone, locale) });
    case "considered": return d["to"] ? format(w.proposed, { actor, job: String(d["job"] ?? "") }) : format(w.considered, { actor });
    case "imported": return format(w.imported, { actor, origin: String(d["origin"] || t.candidate.anotherTool) });
    case "cv": return format(d["replaced"] ? w.cvReplaced : w.cv, { actor });
    default: return format(w.note, { actor });
  }
}
