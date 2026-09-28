import Link from "next/link";
import { Arrow, Plus, Star } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { waitingOn } from "../../lib/candidates.ts";
import { db } from "../../lib/db.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { listJobs, type JobRow } from "../../lib/jobs.ts";
import { nameOf, people } from "../../lib/people.ts";
import { viewer } from "../../lib/session.ts";

// The jobs: what waits for my feedback first, then the open jobs with their
// pipeline at a glance, the drafts, the closed ones.
export default async function Jobs() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const sql = db();
  const [list, waiting] = await Promise.all([listJobs(sql, member), waitingOn(sql, member)]);
  const who = await people(waiting.map(w => w.requestedBy));
  const recruiter = can(member, "jobs.manage");
  const groups: [string, JobRow[]][] = [
    [t.home.open, list.filter(j => j.state === "open")],
    [t.home.drafts, list.filter(j => j.state === "draft")],
    [t.home.closed, list.filter(j => j.state === "closed")],
  ];
  return (
    <>
      <div className="page-head">
        <h1>{t.home.title}</h1>
        {recruiter && <Link className="button" href="/chest/jobs/new"><Plus />{t.shell.newJob}</Link>}
      </div>

      {waiting.length > 0 && (
        <section className="waiting" aria-labelledby="waiting">
          <h2 id="waiting"><Star />{t.home.waiting}</h2>
          <ul>
            {waiting.map(w => (
              <li key={w.candidateId}>
                <Link href={`/chest/candidates/${w.candidateId}`}>
                  <span className="waiting-name">{format(t.home.waitingItem, { candidate: w.name, job: w.jobTitle })}</span>
                  <span className="muted small">{format(t.home.askedBy, { name: nameOf(who.get(w.requestedBy), locale), when: relative(w.requestedAt, locale) })}</span>
                  <Arrow />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        recruiter ? (
          <div className="empty">
            <h2>{t.home.emptyTitle}</h2>
            <p>{t.home.emptyBody}</p>
            <Link className="button" href="/chest/jobs/new"><Plus />{t.home.emptyAction}</Link>
          </div>
        ) : (
          <div className="empty">
            <h2>{t.home.emptyInterviewerTitle}</h2>
            <p>{t.home.emptyInterviewerBody}</p>
          </div>
        )
      ) : (
        groups.filter(([, jobs]) => jobs.length > 0).map(([title, jobs]) => (
          <section key={title} className="job-group" aria-label={title}>
            <h2 className="group-title">{title}<span className="count">{jobs.length}</span></h2>
            <ul className="job-cards">
              {jobs.map(j => (
                <li key={j.id}>
                  <Link className={`job-card state-${j.state}`} href={`/chest/jobs/${j.id}`}>
                    <span className="job-card-top">
                      <span className="job-card-title">{j.title}</span>
                      {j.unseen > 0 && <span className="chip new">{plural(t.home.unseen, j.unseen, locale)}</span>}
                    </span>
                    <span className="job-card-facts">{[j.team, j.place, t.facts.contract[j.contract]].filter(Boolean).join(" · ")}</span>
                    <span className="pipeline" aria-label={t.home.pipeline}>
                      {j.stages.map(s => (
                        <span key={s.id} className={`pipe${s.count > 0 ? " full" : ""}${s.hired ? " hired" : ""}`}>
                          <span className="pipe-n">{s.count}</span>
                          <span className="pipe-name">{s.name}</span>
                        </span>
                      ))}
                    </span>
                    <span className="job-card-foot">
                      <span>{plural(t.home.candidates, j.active, locale)}</span>
                      {j.waiting > 0 && <span className="chip asked">{plural(t.home.waitingCount, j.waiting, locale)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
