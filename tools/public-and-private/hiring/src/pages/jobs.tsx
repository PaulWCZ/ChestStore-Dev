import type { MemberContext, PageContext, View } from "@argentic/chest-app";
import { EmptyState, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { Arrow, Calendar, External, Inbox, Plus, Star } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { waitingOn } from "../lib/candidates.ts";
import { db } from "../lib/db.ts";
import { upcoming } from "../lib/interviews.ts";
import { jobTemplateKeys, listJobs, type JobRow } from "../lib/jobs.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { format, meetingTime, plural, relative } from "../shared/format.ts";
import { stageLabel } from "../shared/stages.ts";

// What the jobs page shows, in a few characters (a refresh that has it
// gets a 304): the jobs, the candidates' places, what waits for the
// reader, their interviews, the emails to file.
export async function jobsVersion({ member }: PageContext<MemberContext>): Promise<string | null> {
  const [row] = await db()<{ v: string | null }[]>`
    select md5(concat_ws('|',
      (select string_agg(id || ':' || state || ':' || updated_at::text, ',' order by id) from jobs),
      (select string_agg(id || ':' || stage_id || ':' || status, ',' order by id) from candidates),
      (select string_agg(candidate_id || ':' || member_id, ',' order by candidate_id, member_id) from candidate_seen where member_id = ${member.id}),
      (select string_agg(candidate_id::text, ',' order by candidate_id) from feedback_requests where member_id = ${member.id}),
      (select max(updated_at)::text from interviews),
      (select count(*)::text from messages where candidate_id is null),
      (select string_agg(stage_id || ':' || position, ',' order by stage_id) from (select id as stage_id, position from stages) s))) as v`;
  return row?.v ?? null;
}

// The jobs: what waits for my feedback first, then my next interviews,
// then the open jobs with their pipeline at a glance, the drafts, the
// closed ones.
export async function jobsPage({ member, t, locale: tag, f }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(tag);
  const sql = db();
  const [list, waiting, next] = await Promise.all([listJobs(sql, member), waitingOn(sql, member), upcoming(sql, member)]);
  const who = await people(waiting.map(w => w.requestedBy));
  const recruiter = can(member, "jobs.manage");
  const careers = (publicOrigin() ?? "") + "/";
  const groups: [string, JobRow[]][] = [
    [t.home.open, list.filter(j => j.state === "open")],
    [t.home.drafts, list.filter(j => j.state === "draft")],
    [t.home.closed, list.filter(j => j.state === "closed")],
  ];
  return {
    title: t.home.title,
    body: (
      <>
        {/* One primary action: "New job" — in the empty state when there is
            none yet (with a few jobs to start from), in the header after.
            The careers page is a quiet link, never a button above it. */}
        <PageHeader title={t.home.title} action={recruiter && list.length > 0 ? <a className="button" href="/chest/jobs/new"><Plus />{t.shell.newJob}</a> : null} />
        {list.length > 0 && <p className="careers-link"><a href={careers} target="_blank" rel="noopener">{t.shell.careers}<External /></a></p>}

        {waiting.length > 0 && (
          <section className="waiting" aria-labelledby="waiting">
            <h2 id="waiting"><Star />{t.home.waiting}</h2>
            <ul>
              {waiting.map(w => (
                <li key={w.candidateId} id={`waiting-${w.candidateId}`}>
                  <a href={`/chest/candidates/${w.candidateId}`}>
                    <span className="waiting-name">{format(t.home.waitingItem, { candidate: w.name, job: w.jobTitle })}</span>
                    <span className="muted small">{format(t.home.askedBy, { name: nameOf(who.get(w.requestedBy), locale), when: relative(w.requestedAt, locale) })}</span>
                    <Arrow />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}


        {next.length > 0 && (
          <section className="upcoming" aria-labelledby="upcoming">
            <h2 id="upcoming" className="group-title"><Calendar />{t.home.interviews}</h2>
            <ul className="upcoming-list">
              {next.map(i => (
                <li key={i.id} id={`upcoming-${i.id}`}>
                  <a href={`/chest/candidates/${i.candidateId}`}>
                    <span className="up-when">{meetingTime(i.start, f.timeZone, locale)}</span>
                    <span>{format(t.home.waitingItem, { candidate: i.candidateName, job: i.jobTitle })}</span>
                    {i.place && <span className="muted small">{i.place}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {list.length === 0 ? (
          recruiter ? (
            <>
              <EmptyState title={t.home.emptyTitle} body={t.home.emptyBody} action={<a className="button" href="/chest/jobs/new"><Plus />{t.home.emptyAction}</a>} />
              <nav className="job-templates" aria-labelledby="templates-title">
                <h2 id="templates-title" className="label">{t.jobTemplates.intro}</h2>
                <ul>
                  {jobTemplateKeys.map(k => <li key={k}><a href={`/chest/jobs/new?template=${k}`}>{t.jobTemplates.items[k].title}<Arrow /></a></li>)}
                </ul>
              </nav>
            </>
          ) : <EmptyState title={t.home.emptyInterviewerTitle} body={t.home.emptyInterviewerBody} />
        ) : (
          groups.filter(([, jobs]) => jobs.length > 0).map(([title, jobs]) => (
            <section key={title} className="job-group" aria-label={title}>
              <h2 className="group-title">{title}<span className="count">{jobs.length}</span></h2>
              <ul className="job-cards">
                {jobs.map(j => (
                  <li key={j.id} id={`job-${j.id}`}>
                    <a className={`job-card state-${j.state}`} href={`/chest/jobs/${j.id}`}>
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
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </>
    ),
  };
}
