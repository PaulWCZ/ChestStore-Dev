import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download, External, Link as LinkIcon, Mail, Phone } from "../../../../components/icons.tsx";
import { candidate as readCandidate, type Activity, type CandidateDetail } from "../../../../lib/candidates.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { fileSize, format, formatDate, languageNames, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { interviewersOf, settings } from "../../../../lib/jobs.ts";
import { rejectionDraft } from "../../../../lib/mailer.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import * as tell from "../../../../lib/tell.ts";
import { teammates } from "../../../../lib/team.ts";
import { CandidateActions, FeedbackForm, FeedbackList, Notes } from "./candidate-view.tsx";

const day = (value: string, locale: Locale) => formatDate(value, locale, { day: "numeric", month: "long", year: "numeric" });

// One candidate: who they are, their CV, what the team thinks, what
// happened. A recruiter moves them on from here; an interviewer gives
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
  const ids = [
    ...d.notes.map(n => n.author), ...d.others.map(f => f.author), ...d.asked, ...onJob, ...(c.addedBy ? [c.addedBy] : []),
    ...d.activity.flatMap(a => [a.actor ?? "", ...(Array.isArray(a.data["members"]) ? (a.data["members"] as string[]) : [])]),
  ];
  const who = await people(ids);
  const name = (id: string | null) => (id === member.id ? member.name : nameOf(who.get(id ?? ""), locale));
  const stage = d.stages.find(x => x.id === c.stageId);
  const next = d.stages[d.stages.findIndex(x => x.id === c.stageId) + 1];
  const kept = new Date(c.lastActivityAt);
  kept.setUTCMonth(kept.getUTCMonth() + s.retentionMonths);
  // Whom a recruiter may ask: the job's interviewers and the recruiters,
  // not themselves, not those who already gave feedback.
  const gave = new Set([...d.others.map(f => f.author), ...(d.mine ? [member.id] : [])]);
  const team = manage ? await teammates() : [];
  const askable = team.filter(m => m.id !== member.id && !gave.has(m.id) && (onJob.includes(m.id) || m.role === "recruiter")).map(m => ({ id: m.id, name: m.name, asked: d.asked.includes(m.id) }));
  const draft = rejectionDraft(c, d.job, s.companyName, member.firstName || member.name);
  const isPdf = c.cv?.type === "application/pdf";
  const tc = t.candidate;
  const status = c.status === "rejected" ? format(tc.rejectedLine, { reason: c.rejectReason ? t.reject.reasons[c.rejectReason] : "" }) : stage?.hired ? tc.hiredLine : stage?.name ?? "";

  return (
    <div className="candidate-page">
      <Link className="back-link" href={`/chest/jobs/${c.jobId}`}><Back />{format(tc.back, { job: d.job.title })}</Link>
      <header className="cand-head">
        <div className="cand-title">
          <h1>{c.name}</h1>
          <span className={`chip ${c.status === "rejected" ? "rejected" : stage?.hired ? "hired" : "stage"}`}>{status}</span>
        </div>
        <p className="muted">
          {c.source === "careers" ? format(tc.applied, { date: day(c.createdAt, locale) }) : format(tc.addedBy, { name: name(c.addedBy), date: day(c.createdAt, locale) })}
          {" · "}{d.job.title}
          {c.status === "active" && stage?.hired && c.startDate && <>{" · "}<strong>{format(t.hire.startsOn, { date: formatDate(c.startDate + "T12:00:00Z", locale, { day: "numeric", month: "long", year: "numeric" }) })}</strong></>}
        </p>
        {manage && (
          <CandidateActions
            jobId={c.jobId}
            candidate={{ id: c.id, name: c.name, status: c.status, stageId: c.stageId, email: c.email, phone: c.phone, link: c.link, language: c.language }}
            stages={d.stages.map(x => ({ id: x.id, name: x.name, hired: x.hired }))}
            next={c.status === "active" && next ? { id: next.id, name: next.name } : null}
            askable={askable}
            draft={draft.text}
            languageName={languageNames[c.language] ?? c.language}
            locale={locale}
            t={{ candidate: tc, reject: t.reject, errors: t.errors, common: t.common, apply: t.apply, board: t.board, hire: t.hire }}
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
                  <a className="button quiet small" href={`/chest/candidates/${c.id}/cv`} target="_blank" rel="noopener"><External />{tc.openCv}</a>
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
            {c.coverLetter && (
              <div className="cover">
                <h3>{tc.coverLetter}</h3>
                <p className="pre">{c.coverLetter}</p>
              </div>
            )}
          </section>

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
          <section className="panel" aria-labelledby="contact">
            <h2 id="contact">{tc.contact}</h2>
            <ul className="contact">
              <li><Mail /><a href={`mailto:${c.email}`}>{c.email}</a></li>
              {c.phone && <li><Phone /><a href={`tel:${c.phone.replace(/[^+0-9]/gu, "")}`}>{c.phone}</a></li>}
              {c.link && <li><LinkIcon /><a href={c.link} target="_blank" rel="noopener noreferrer nofollow">{c.link.replace(/^https?:\/\/(www\.)?/u, "").replace(/\/$/u, "")}</a></li>}
            </ul>
            <dl className="facts-list">
              <div><dt>{tc.language}</dt><dd>{languageNames[c.language] ?? c.language}</dd></div>
              <div><dt>{t.export.headers.source}</dt><dd>{tc.source[c.source]}</dd></div>
            </dl>
            {c.consentAt && <p className="muted small">{format(tc.consent, { date: day(c.consentAt, locale) })}</p>}
            <p className="muted small">{format(tc.keptUntil, { date: day(kept.toISOString(), locale) })}</p>
          </section>

          {d.elsewhere.length > 0 && (
            <section className="panel" aria-labelledby="elsewhere">
              <h2 id="elsewhere">{tc.elsewhere}</h2>
              <ul className="plain-list">
                {d.elsewhere.map(e => (
                  <li key={e.id}><Link href={`/chest/candidates/${e.id}`}>{e.jobTitle}</Link> <span className="muted small">· {e.status === "rejected" ? t.export.status.rejected : e.stage} · {day(e.createdAt, locale)}</span></li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="history">
            <h2 id="history">{tc.history}</h2>
            <ol className="timeline">
              {d.activity.map(a => (
                <li key={a.id}>
                  <span>{line(a, t, name)}</span>
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

// One line of the history, in the reader's words.
function line(a: Activity, t: Catalogue, name: (id: string | null) => string): string {
  const w = t.candidate.activity;
  const actor = name(a.actor);
  const d = a.data as Record<string, unknown>;
  switch (a.kind) {
    case "applied": return w.applied;
    case "added": return format(w.added, { actor });
    case "moved": return format(w.moved, { actor, from: String(d["from"] ?? ""), to: String(d["to"] ?? "") });
    case "rejected": return format(w.rejected, { actor, reason: t.reject.reasons[(d["reason"] as keyof Catalogue["reject"]["reasons"]) ?? "other"] ?? "" });
    case "restored": return format(w.restored, { actor });
    case "feedback": return format(w.feedback, { actor });
    case "asked": {
      const names = (Array.isArray(d["members"]) ? (d["members"] as string[]) : []).map(m => name(m));
      const list = names.length > 1 ? format(t.common.and, { a: names.slice(0, -1).join(", "), b: names.at(-1)! }) : names[0] ?? "";
      return format(w.asked, { actor, names: list });
    }
    case "emailed": return d["kind"] === "rejection" ? format(w.emailedRejection, { actor }) : w.emailedConfirmation;
    case "cv": return format(d["replaced"] ? w.cvReplaced : w.cv, { actor });
    default: return format(w.note, { actor });
  }
}
