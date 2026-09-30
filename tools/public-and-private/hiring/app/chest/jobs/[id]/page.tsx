import { StatusBadge } from "@argentic/chest-ui/components";
import { chest } from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { board as readBoard } from "../../../../lib/candidates.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { job as readJob, type JobDetail } from "../../../../lib/jobs.ts";
import { mailState } from "../../../../lib/mail-state.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { stageLabel } from "../../../../lib/stages.ts";
import { shareLinks } from "../../../../lib/reach.ts";
import { dayOf } from "../../../../lib/time.ts";
import { BoardView } from "./board-view.tsx";
import { JobActions } from "./job-actions.tsx";

// A job's pipeline: its candidates by stage, dragged from one to the next.
export default async function JobBoard({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { id } = await params;
  const sql = db();
  let detail: JobDetail;
  try {
    detail = await readJob(sql, v.member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { t, locale } = v;
  const { job, access, stages } = detail;
  const cards = await readBoard(sql, v.member, job.id);
  const link = `${publicOrigin(await headers()) ?? ""}/${job.slug}`;
  const manage = access === "manage";
  return (
    <div className="board-page">
      <div className="board-head">
        <Link className="back-link" href="/chest"><Back />{t.board.back}</Link>
        <div className="board-title">
          <h1>{job.title}</h1>
          <StatusBadge tone={job.state === "open" ? "ok" : job.state === "draft" ? "wait" : "neutral"} label={t.home.states[job.state]} />
        </div>
        <p className="muted board-facts">{[job.team, job.place, t.facts.contract[job.contract], t.facts.remote[job.remote]].filter(Boolean).join(" · ")}</p>
        {manage && (
          <JobActions
            job={{ id: job.id, state: job.state, hasDescription: job.description.trim() !== "" }}
            link={link}
            share={shareLinks(link, job.title)}
            t={{ board: t.board, errors: t.errors, common: t.common }}
          />
        )}
      </div>
      {job.state === "draft" && manage && <p className="notice">{job.description.trim() ? t.board.draftNotice : t.board.needsDescription}</p>}
      {job.state === "closed" && <p className="notice">{t.board.closedNotice}</p>}
      {!manage && <p className="notice">{t.board.readOnly}</p>}
      <BoardView
        stages={stages.map(s => ({ ...s, label: stageLabel(s, t.jobSettings.defaults) }))}
        cards={cards}
        manage={manage}
        locale={locale}
        today={dayOf(new Date(), chest.timeZone)}
        mailing={manage ? await mailState() : "unknown"}
        t={{ board: t.board, errors: t.errors, reasons: t.reject.reasons, reject: t.reject, common: t.common, hire: t.hire, dialog: t.dialog, date: t.dates }}
      />
    </div>
  );
}
