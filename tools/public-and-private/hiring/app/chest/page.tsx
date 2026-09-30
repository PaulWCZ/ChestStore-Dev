import { EmptyState, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import Link from "next/link";
import { Arrow, Calendar, External, Inbox, Plus, Star } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import { waitingOn } from "../../lib/candidates.ts";
import { db } from "../../lib/db.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { upcoming } from "../../lib/interviews.ts";
import { jobTemplateKeys, listJobs, type JobRow } from "../../lib/jobs.ts";
import { unmatchedCount } from "../../lib/messages.ts";
import { stageLabel } from "../../lib/stages.ts";
import { meetingTime } from "../../lib/i18n/format.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";

// The jobs: what waits for my feedback first, then the open jobs with their
// pipeline at a glance, the drafts, the closed ones.
export default async function Jobs() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const sql = db();
  const [list, waiting, next] = await Promise.all([listJobs(sql, member), waitingOn(sql, member), upcoming(sql, member)]);
  const toFile = can(member, "candidates.manage") ? await unmatchedCount(sql) : 0;
  const zone = chest.timeZone;
  const who = await people(waiting.map(w => w.requestedBy));
  const recruiter = can(member, "jobs.manage");
  const careers = (publicOrigin(await headers()) ?? "") + "/";
  const groups: [string, JobRow[]][] = [
    [t.home.open, list.filter(j => j.state === "open")],
    [t.home.drafts, list.filter(j => j.state === "draft")],
    [t.home.closed, list.filter(j => j.state === "closed")],
  ];
  return (
    <>
      {/* One primary action: "New job" — in the empty state when there is
          none yet (with a few jobs to start from), in the header after. The
          careers page is a quiet link, never a button above it. */}
      <PageHeader
        title={t.home.title}
        action={recruiter && list.length > 0 ? <Link className="button" href="/chest/jobs/new"><Plus />{t.shell.newJob}</Link> : null}
      />
      {list.length > 0 && <p className="careers-link"><a href={careers} target="_blank" rel="noopener">{t.shell.careers}<External /></a></p>}

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

      {toFile > 0 && (
        <p className="notice with-link"><Inbox /><Link href="/chest/mail">{plural(t.mailbox.toFile, toFile, locale)}</Link></p>
      )}

      {next.length > 0 && (
        <section className="upcoming" aria-labelledby="upcoming">
          <h2 id="upcoming" className="group-title"><Calendar />{t.home.interviews}</h2>
          <ul className="upcoming-list">
            {next.map(i => (
              <li key={i.id}>
                <Link href={`/chest/candidates/${i.candidateId}`}>
                  <span className="up-when">{meetingTime(i.start, zone, locale)}</span>
                  <span className="up-who">{format(t.home.waitingItem, { candidate: i.candidateName, job: i.jobTitle })}</span>
                  {i.place && <span className="muted small">{i.place}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        recruiter
          ? (
            <>
              <EmptyState title={t.home.emptyTitle} body={t.home.emptyBody} action={<Link className="button" href="/chest/jobs/new"><Plus />{t.home.emptyAction}</Link>} />
              <nav className="job-templates" aria-labelledby="templates-title">
                <h2 id="templates-title" className="label">{t.jobTemplates.intro}</h2>
                <ul>
                  {jobTemplateKeys.map(k => <li key={k}><Link href={`/chest/jobs/new?template=${k}`}>{t.jobTemplates.items[k].title}<Arrow /></Link></li>)}
                </ul>
              </nav>
            </>
          )
          : <EmptyState title={t.home.emptyInterviewerTitle} body={t.home.emptyInterviewerBody} />
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
                      {j.unseen > 0 && <StatusBadge category={3} size="s" label={plural(t.home.unseen, j.unseen, locale)} />}
                    </span>
                    <span className="job-card-facts">{[j.team, j.place, t.facts.contract[j.contract]].filter(Boolean).join(" · ")}</span>
                    <span className="pipeline" aria-label={t.home.pipeline}>
                      {j.stages.map(s => (
                        <span key={s.id} className={`pipe${s.count > 0 ? " full" : ""}${s.hired ? " hired" : ""}`}>
                          <span className="pipe-n">{s.count}</span>
                          <span className="pipe-name">{stageLabel(s, t.jobSettings.defaults)}</span>
                        </span>
                      ))}
                    </span>
                    <span className="job-card-foot">
                      <span>{plural(t.home.candidates, j.active, locale)}</span>
                      {j.waiting > 0 && <StatusBadge tone="info" size="s" label={plural(t.home.waitingCount, j.waiting, locale)} />}
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
