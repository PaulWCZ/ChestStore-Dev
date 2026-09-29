import { StatusBadge } from "@argentic/chest-ui/components";
import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download, External, Link as LinkIcon, Mail, Phone, Star } from "../../../../components/icons.tsx";
import { candidate as readCandidate, type Activity, type CandidateDetail } from "../../../../lib/candidates.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { catalogue, fileSize, format, formatDate, languageNames, locales, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { meetingTime } from "../../../../lib/i18n/format.ts";
import { ofCandidate } from "../../../../lib/interviews.ts";
import { interviewersOf, settings } from "../../../../lib/jobs.ts";
import { rejectionDraft, values as mailValues } from "../../../../lib/mailer.ts";
import { conversation, templates as companyTemplates } from "../../../../lib/messages.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { labelOf, stageLabel } from "../../../../lib/stages.ts";
import * as tell from "../../../../lib/tell.ts";
import { teammates } from "../../../../lib/team.ts";
import { dayOf } from "../../../../lib/time.ts";
import { CandidateActions, Conversation, FeedbackForm, FeedbackList, Interviews, Notes } from "./candidate-view.tsx";

const day = (value: string, locale: Locale) => formatDate(value, locale, { day: "numeric", month: "long", year: "numeric" });

// One candidate: who they are, their CV and answers, what the team
// thinks, the emails, the interviews, what happened. A recruiter moves
// them on, writes to them, invites them from here; an interviewer gives
// their feedback.
export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { id } = await params;
  const sql = db();
  let d: CandidateDetail;
  try {
    d = await readCandidate(sql, v.member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { t, locale, member } = v;
  const c = d.candidate;
  const manage = d.access === "manage";
  if (manage) {
    await tell.opened(member, c.id);
    await tell.refreshBadges(sql);
  }
  const s = await settings(sql);
  const onJob = await interviewersOf(sql, c.jobId);
  const [mails, meetings, own] = await Promise.all([
    manage ? conversation(sql, member, c.id) : Promise.resolve([]),
    ofCandidate(sql, member, c.id),
    manage ? companyTemplates(sql, member) : Promise.resolve([]),
  ]);
  const ids = [
    ...d.notes.map(n => n.author), ...d.others.map(f => f.author), ...d.asked, ...onJob, ...(c.addedBy ? [c.addedBy] : []),
    ...d.activity.flatMap(a => [a.actor ?? "", ...(Array.isArray(a.data["members"]) ? (a.data["members"] as string[]) : []), ...(Array.isArray(a.data["people"]) ? (a.data["people"] as string[]) : [])]),
    ...mails.map(m => m.author ?? ""), ...meetings.flatMap(m => m.people),
  ];
  const who = await people(ids);
  const name = (id: string | null) => (id === member.id ? member.name : nameOf(who.get(id ?? ""), locale));
  const defaults = t.jobSettings.defaults;
  const stage = d.stages.find(x => x.id === c.stageId);
  const next = d.stages[d.stages.findIndex(x => x.id === c.stageId) + 1];
  const kept = new Date(c.lastActivityAt);
  kept.setUTCMonth(kept.getUTCMonth() + s.retentionMonths);
  // Whom a recruiter may ask, or invite: the job's interviewers and the
  // recruiters (not themselves for feedback; not those who gave theirs).
  const gave = new Set([...d.others.map(f => f.author), ...(d.mine ? [member.id] : [])]);
  const team = manage ? await teammates() : [];
  const eligible = team.filter(m => onJob.includes(m.id) || m.role === "recruiter");
  const askable = eligible.filter(m => m.id !== member.id && !gave.has(m.id)).map(m => ({ id: m.id, name: m.name, asked: d.asked.includes(m.id) }));
  const sender = member.firstName || member.name;
  const draft = rejectionDraft(c, d.job, s.companyName, sender);
  const isPdf = c.cv?.type === "application/pdf";
  const tc = t.candidate;
  const status = c.status === "rejected" ? format(tc.rejectedLine, { reason: c.rejectReason ? t.reject.reasons[c.rejectReason] : "" }) : stage?.hired ? tc.hiredLine : stageLabel(stage, defaults);
  // The templates a recruiter starts from: the tool's own in each language
  // (the candidate's first), then the company's.
  const values = mailValues(c, d.job, s.companyName, sender);
  const builtIn = [c.language, ...locales.filter(l => l !== c.language)].flatMap(l => {
    const w = catalogue(l).templates;
    return (["availability", "followUp", "offer", "reject"] as const).map(k => ({ id: `${k}:${l}`, name: w[k].name, language: l, subject: w[k].subject, body: w[k].body }));
  });
  const zone = chest.timeZone();
  const today = dayOf(new Date(), zone);
  // Jobs this person could be proposed for: open or draft, not this one.
  const otherJobs = manage ? await sql<{ id: string; title: string }[]>`select id, title from jobs where state != 'closed' and id != ${c.jobId} order by title limit 200` : [];

  return (
    <div className="candidate-page">
      <Link className="back-link" href={`/chest/jobs/${c.jobId}`}><Back />{format(tc.back, { job: d.job.title })}</Link>
      <header className="cand-head">
        <div className="cand-title">
          <h1>{c.name}</h1>
          <StatusBadge tone={c.status === "rejected" ? "danger" : stage?.hired ? "ok" : "info"} label={status} />
          {c.poolAt && <StatusBadge tone="neutral" icon={<Star />} label={tc.inPool} />}
        </div>
        <p className="muted">
          {c.source === "careers" ? format(tc.applied, { date: day(c.createdAt, locale) }) : c.source === "import" ? format(tc.importedFrom, { origin: c.origin || tc.anotherTool, date: day(c.createdAt, locale) }) : format(tc.addedBy, { name: name(c.addedBy), date: day(c.createdAt, locale) })}
          {" · "}{d.job.title}
          {c.status === "active" && stage?.hired && c.startDate && <>{" · "}<strong>{format(t.hire.startsOn, { date: formatDate(c.startDate + "T12:00:00Z", locale, { day: "numeric", month: "long", year: "numeric" }) })}</strong></>}
        </p>
        {manage && (
          <CandidateActions
            jobId={c.jobId}
            candidate={{ id: c.id, name: c.name, status: c.status, stageId: c.stageId, email: c.email, phone: c.phone, link: c.link, language: c.language, inPool: c.poolAt !== null }}
            stages={d.stages.map(x => ({ id: x.id, name: stageLabel(x, defaults), hired: x.hired }))}
            next={c.status === "active" && next ? { id: next.id, name: stageLabel(next, defaults) } : null}
            askable={askable}
            draft={draft.text}
            languageName={languageNames[c.language] ?? c.language}
            locale={locale}
            write={{ templates: [...builtIn, ...own.map(x => ({ id: x.id, name: x.name, language: x.language, subject: x.subject, body: x.body }))], values, languageNames }}
            interview={{ people: eligible.map(m => ({ id: m.id, name: m.name })), preselected: [member.id], today, zone: zone.split("/").at(-1)?.replace(/_/gu, " ") ?? zone, zoneId: zone }}
            jobs={otherJobs.map(j => ({ id: String(j.id), title: j.title }))}
            t={{ candidate: tc, reject: t.reject, errors: t.errors, common: t.common, apply: t.apply, board: t.board, hire: t.hire, write: t.write, interview: t.interview, dialog: t.dialog, date: t.dates }}
          />
        )}
      </header>

      <div className="cand-grid">
        <div className="cand-main">
          {d.access === "interview" && c.status === "active" && (
            <section className="panel feedback-panel" aria-labelledby="your-feedback">
              <h2 id="your-feedback">{tc.yourFeedback}</h2>
              <FeedbackForm candidateId={c.id} mine={d.mine} t={{ candidate: tc, errors: t.errors }} />
            </section>
          )}

          <section className="panel" aria-labelledby="cv">
            <div className="panel-head">
              <h2 id="cv">{tc.cv}</h2>
              {c.cv && (
                <span className="panel-actions">
                  {isPdf && <a className="button quiet small" href={`/chest/candidates/${c.id}/cv`} target="_blank" rel="noopener"><External />{tc.openCv}</a>}
                  <a className="button quiet small" href={`/chest/candidates/${c.id}/cv?download`}><Download />{tc.downloadCv}</a>
                </span>
              )}
            </div>
            {c.cv ? (
              <>
                <p className="muted small">{c.cv.fileName} · {fileSize(c.cv.size, locale)}</p>
                {isPdf && <iframe className="cv-frame" src={`/chest/candidates/${c.id}/cv`} title={tc.cvPreview} loading="lazy" />}
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
              <Conversation
                messages={mails.map(m => ({ ...m, authorName: m.author ? name(m.author) : m.kind === "confirmation" ? t.write.automatic : "", when: formatDate(m.createdAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }))}
                candidate={{ name: c.name, email: c.email }}
                locale={locale}
                t={{ write: t.write }}
              />
            </section>
          )}

          <section className="panel" aria-labelledby="feedback">
            <div className="panel-head"><h2 id="feedback">{tc.feedback}</h2></div>
            {manage && d.asked.length > 0 && <p className="muted small">{format(tc.waitingFor, { names: d.asked.map(a => name(a)).join(", ") })}</p>}
            <FeedbackList
              mine={d.mine ? { ...d.mine, authorName: name(member.id) } : null}
              others={d.others.map(f => ({ ...f, authorName: name(f.author) }))}
              hidden={d.othersHidden}
              locale={locale}
              t={{ candidate: tc }}
            />
            {manage && c.status === "active" && (
              <details className="own-feedback">
                <summary className="button quiet small">{d.mine ? tc.updateFeedback : tc.yourFeedback}</summary>
                <FeedbackForm candidateId={c.id} mine={d.mine} t={{ candidate: tc, errors: t.errors }} />
              </details>
            )}
          </section>

          <section className="panel" aria-labelledby="notes">
            <h2 id="notes">{tc.notes}</h2>
            <Notes
              candidateId={c.id}
              notes={d.notes.map(n => ({ ...n, authorName: name(n.author), when: formatDate(n.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), mine: n.author === member.id }))}
              canWrite={manage}
              t={{ candidate: tc, errors: t.errors }}
            />
          </section>
        </div>

        <aside className="cand-side">
          {(meetings.length > 0 || manage) && (
            <section className="panel" aria-labelledby="interviews">
              <h2 id="interviews">{t.interview.title}</h2>
              <Interviews
                list={meetings.map(m => ({ id: m.id, when: meetingTime(m.start, zone, locale), past: new Date(m.end).getTime() < Date.now(), place: m.place, people: m.people.map(p => name(p)).join(", "), cancelled: m.cancelled, ics: m.calendar === "off" }))}
                manage={manage}
                t={{ interview: t.interview, errors: t.errors, common: t.common }}
              />
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
            {c.poolAt && <p className="muted small">{format(tc.poolSince, { date: day(c.poolAt, locale) })}</p>}
            {c.consentAt && <p className="muted small">{format(tc.consent, { date: day(c.consentAt, locale) })}</p>}
            <p className="muted small">{format(tc.keptUntil, { date: day(kept.toISOString(), locale) })}</p>
          </section>

          {d.elsewhere.length > 0 && (
            <section className="panel" aria-labelledby="elsewhere">
              <h2 id="elsewhere">{tc.elsewhere}</h2>
              <ul className="plain-list">
                {d.elsewhere.map(e => (
                  <li key={e.id}><Link href={`/chest/candidates/${e.id}`}>{e.jobTitle}</Link> <span className="muted small">· {e.status === "rejected" ? t.export.status.rejected : stageLabel(e.stage, defaults)} · {day(e.createdAt, locale)}</span></li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="history">
            <h2 id="history">{tc.history}</h2>
            <ol className="timeline">
              {d.activity.map(a => (
                <li key={a.id}>
                  <span>{line(a, t, name, zone, locale)}</span>
                  <time dateTime={a.at} className="muted small">{formatDate(a.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

// One line of the history, in the reader's words (stage names too: a
// default stage reads in the reader's language).
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
    case "wrote": return d["kind"] === "interview" ? format(w.invited, { actor }) : d["kind"] === "interview_cancelled" ? format(w.toldCancelled, { actor }) : format(w.wrote, { actor });
    case "written_outside": return format(w.writtenOutside, { actor });
    case "replied": return d["filed"] ? format(w.filed, { actor }) : d["auto"] ? w.autoReply : w.replied;
    case "interview": return format(w.interview, { actor, when: meetingTime(String(d["at"] ?? ""), zone, locale), names: list("people") });
    case "interview_cancelled": return format(w.interviewCancelled, { actor, when: meetingTime(String(d["at"] ?? ""), zone, locale) });
    case "considered": return d["to"] ? format(w.proposed, { actor, job: String(d["job"] ?? "") }) : format(w.considered, { actor });
    case "imported": return format(w.imported, { actor, origin: String(d["origin"] || t.candidate.anotherTool) });
    case "cv": return format(d["replaced"] ? w.cvReplaced : w.cv, { actor });
    default: return format(w.note, { actor });
  }
}
