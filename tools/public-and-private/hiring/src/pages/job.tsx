import { chest } from "@argentic/chest-sdk/chest";
import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { board as readBoard, boardLimits } from "../lib/candidates.ts";
import { countryNames } from "../lib/countries.ts";
import { db } from "../lib/db.ts";
import { isJobTemplate, job as readJob, settings, type JobDetail } from "../lib/jobs.ts";
import { mailState } from "../lib/mail-state.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { shareLinks } from "../lib/reach.ts";
import { teammates } from "../lib/team.ts";
import { stageLabel } from "../shared/stages.ts";
import { dayOf } from "../shared/time.ts";

// A job's pages for the team: its board, its settings (stages,
// interviewers), writing it, adding a candidate by hand, importing.

// A job the reader may see (a recruiter, or an interviewer on it): else
// 404 — it does not exist for them. manage: a recruiter's pages only.
async function jobOf(ctx: PageContext<MemberContext>, manage = false): Promise<JobDetail> {
  const detail = await readJob(db(), ctx.member, ctx.param("id"));
  if (manage && detail.access !== "manage") notFound();
  return detail;
}

// What a board shows, in a few characters: its stages, its candidates'
// places and what changes a card (feedback, a note, an email: the
// candidate's last news), what the reader opened.
export async function boardVersion(ctx: PageContext<MemberContext>): Promise<string | null> {
  const id = ctx.param("id");
  if (!/^[1-9][0-9]{0,17}$/u.test(id)) return null;
  const [row] = await db()<{ v: string | null }[]>`
    select md5(concat_ws('|',
      (select state || updated_at::text from jobs where id = ${id}),
      (select string_agg(id || ':' || coalesce(name, '') || ':' || position, ',' order by id) from stages where job_id = ${id}),
      (select string_agg(c.id || ':' || c.stage_id || ':' || c.status || ':' || c.last_activity_at::text, ',' order by c.id) from candidates c where c.job_id = ${id}),
      (select count(*)::text from candidate_seen s join candidates c on c.id = s.candidate_id where c.job_id = ${id} and s.member_id = ${ctx.member.id}),
      (select count(*)::text from feedback_requests r join candidates c on c.id = r.candidate_id where c.job_id = ${id} and r.member_id = ${ctx.member.id}),
      ${ctx.url.search}::text)) as v`;
  return row?.v ?? null;
}

// A job's pipeline: its candidates by stage, dragged from one to the next.
// Each stage shows its first cards and how many there are (?more=<stage>
// shows one further); the rejected are folded below (?rejected=1).
export async function boardPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t, member } = ctx;
  const locale = localeOf(ctx.locale);
  const { job, access, stages } = await jobOf(ctx);
  const open = ctx.query("more") ?? null;
  const showRejected = ctx.query("rejected") === "1";
  const shown = await readBoard(db(), member, job.id, { open, rejected: showRejected });
  const link = `${publicOrigin() ?? ""}/${job.slug}`;
  const manage = access === "manage";
  return {
    title: job.title,
    body: (
      <div className="board-page">
        <div className="board-head">
          <a className="back-link" href="/chest"><Back />{t.board.back}</a>
          <div className="board-title">
            <h1>{job.title}</h1>
            <StatusBadge tone={job.state === "open" ? "ok" : job.state === "draft" ? "wait" : "neutral"} label={t.home.states[job.state]} />
          </div>
          <p className="muted board-facts">{[job.team, job.place, t.facts.contract[job.contract], t.facts.remote[job.remote]].filter(Boolean).join(" · ")}</p>
          {manage && (
            <Island id={`job-actions-${job.id}`} name="JobActions" props={{
              job: { id: job.id, state: job.state, hasDescription: job.description.trim() !== "" }, link, share: shareLinks(link, job.title),
              t: { board: t.board, common: t.common },
            }} />
          )}
        </div>
        {job.state === "draft" && manage && <p className="notice">{job.description.trim() ? t.board.draftNotice : t.board.needsDescription}</p>}
        {job.state === "closed" && <p className="notice">{t.board.closedNotice}</p>}
        {!manage && <p className="notice">{t.board.readOnly}</p>}
        <Island id={`board-${job.id}`} name="BoardView" props={{
          jobId: job.id,
          stages: stages.map(s => ({ id: s.id, hired: s.hired, label: stageLabel(s, t.jobSettings.defaults), count: shown.counts[s.id] ?? 0, open: s.id === open })),
          cards: shown.cards,
          rejected: { count: shown.rejected, shown: showRejected, limit: boardLimits.rejected },
          perStage: boardLimits.perStage,
          manage, locale,
          today: dayOf(new Date(), chest.timeZone),
          mailing: manage ? await mailState() : "unknown",
          t: { board: t.board, reasons: t.reject.reasons, reject: t.reject, common: t.common, hire: t.hire, dialog: t.kit.dialog, date: t.kit.date },
        }} />
      </div>
    ),
  };
}

// Writing a job: a new one (blank, or from a template: the first screen's
// jobs to start from, ?template=officeManager, in the recruiter's
// language), or an existing one.
export async function newJobPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t, member } = ctx;
  if (!can(member, "jobs.manage")) notFound();
  const locale = localeOf(ctx.locale);
  const key = ctx.query("template");
  const start = isJobTemplate(key) ? t.jobTemplates.items[key] : undefined;
  return {
    title: t.jobForm.newTitle,
    body: (
      <div className="narrow">
        <PageHeader title={t.jobForm.newTitle} />
        <Island name="JobForm" props={{
          job: null, ...(start ? { start: { title: start.title, team: start.team, description: start.description } } : {}),
          defaultLanguage: locale, defaultCountry: (await settings(db())).country, countryNames: countryNames(locale), today: dayOf(new Date(), chest.timeZone),
          t: { jobForm: t.jobForm, facts: t.facts, tooLong: t.errors.too_long, date: t.kit.date },
        }} />
      </div>
    ),
  };
}

export async function editJobPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t } = ctx;
  const locale = localeOf(ctx.locale);
  const { job } = await jobOf(ctx, true);
  return {
    title: t.jobForm.editTitle,
    body: (
      <div className="narrow">
        <PageHeader title={t.jobForm.editTitle} />
        <Island id={`job-form-${job.id}`} name="JobForm" props={{
          job, defaultLanguage: locale, defaultCountry: (await settings(db())).country, countryNames: countryNames(locale), today: dayOf(new Date(), chest.timeZone),
          t: { jobForm: t.jobForm, facts: t.facts, tooLong: t.errors.too_long, date: t.kit.date },
        }} />
      </div>
    ),
  };
}

// A job's stages and interviewers, for a recruiter.
export async function jobSettingsPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t } = ctx;
  const locale = localeOf(ctx.locale);
  const detail = await jobOf(ctx, true);
  const sql = db();
  const [who, team] = await Promise.all([people(detail.interviewers), teammates()]);
  const counts = await sql<{ stage_id: string; n: number }[]>`select stage_id, count(*)::int as n from candidates where job_id = ${detail.job.id} group by stage_id`;
  const total = counts.reduce((n, c) => n + c.n, 0);
  return {
    title: t.jobSettings.title,
    body: (
      <div className="narrow">
        <a className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</a>
        <PageHeader title={t.jobSettings.title} />
        <Island id={`job-settings-${detail.job.id}`} name="JobSettingsView" props={{
          jobId: detail.job.id,
          stages: detail.stages.map(s => ({ id: s.id, hired: s.hired, name: stageLabel(s, t.jobSettings.defaults), count: counts.find(c => String(c.stage_id) === s.id)?.n ?? 0 })),
          interviewers: detail.interviewers.map(m => ({ id: m, name: nameOf(who.get(m), locale), photo: who.get(m)?.photo ?? null })),
          choices: team.filter(m => !detail.interviewers.includes(m.id)).map(m => ({ id: m.id, name: m.name, photo: m.photo ?? null, role: m.role === "recruiter" ? t.roles.recruiter : m.role === "interviewer" ? t.roles.interviewer : "" })),
          locale, deletable: total === 0,
          t: { jobSettings: t.jobSettings, common: t.common, peoplePicker: t.kit.peoplePicker },
        }} />
      </div>
    ),
  };
}

// Adding someone the team met: a referral, a CV received by email.
export async function addPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t } = ctx;
  const detail = await jobOf(ctx, true);
  return {
    title: t.addForm.title,
    body: (
      <div className="narrow">
        <a className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</a>
        <PageHeader title={t.addForm.title} intro={t.addForm.intro} />
        <Island id={`add-${detail.job.id}`} name="AddForm" props={{
          jobId: detail.job.id, stages: detail.stages.map(s => ({ id: s.id, name: stageLabel(s, t.jobSettings.defaults) })), language: detail.job.language,
          t: { addForm: t.addForm, apply: t.apply, candidate: { cv: t.candidate.cv, coverLetter: t.candidate.coverLetter }, upload: { invalid: t.errors.cv_invalid, tooLarge: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit }, files: t.kit.files },
        }} />
      </div>
    ),
  };
}

// Bringing candidates from the tool the company leaves (Teamtailor,
// Welcome to the Jungle, Workable, a spreadsheet): their export's CSV, the
// columns checked, the stages matched, then their CVs.
export async function importPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { t } = ctx;
  const locale = localeOf(ctx.locale);
  const detail = await jobOf(ctx, true);
  return {
    title: t.importer.title,
    body: (
      <div className="narrow">
        <a className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</a>
        <PageHeader title={t.importer.title} intro={t.importer.intro} />
        <Island id={`import-${detail.job.id}`} name="ImportView" props={{
          jobId: detail.job.id, language: detail.job.language, stages: detail.stages.map(s => ({ id: s.id, name: stageLabel(s, t.jobSettings.defaults), hired: s.hired })), locale,
          t: { importer: t.importer, common: t.common, languages: t.addForm, upload: { invalid: t.errors.cv_invalid, tooLarge: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit }, files: t.kit.files },
        }} />
      </div>
    ),
  };
}
