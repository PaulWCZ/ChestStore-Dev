import * as chest from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { FollowBadge } from "../../../../../components/state-badge.tsx";
import { sentOne } from "../../../../../lib/answers.ts";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { format, formatDate } from "../../../../../lib/i18n/index.ts";
import { answerText, filesIn } from "../../../../../lib/logic.ts";
import { isLanguage, localize } from "../../../../../lib/model.ts";
import { viewer } from "../../../../../lib/session.ts";

// What I sent: one of my own answers to a team form, as I sent it, and
// where it stands (new, in progress, done, with the note the form's people
// wrote). Read only; nobody else's.
export default async function SentPage({ params }: { params: Promise<{ answer: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const found = await sentOne(db(), member, (await params).answer).catch(error => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found) notFound();
  const { answer, slug } = found;
  const def = isLanguage(answer.language) ? localize(found.definition, answer.language) : found.definition;
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const when = answer.createdAt ? formatDate(answer.createdAt, locale, chest.timeZone(), { dateStyle: "full", timeStyle: "short" }) : "";
  return (
    <div className="answer-page">
      <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
      <header className="answer-head">
        <h1 className="page-title">{def.title}</h1>
        <p className="answer-when">{format(t.sent.when, { when })}</p>
      </header>
      <section className="follow-up panel">
        <h2>{t.follow.title}</h2>
        <p><FollowBadge state={answer.status} label={t.follow.states[answer.status]} /></p>
        {answer.note ? <p className="follow-note">{answer.note}</p> : <p className="hint">{t.sent.noNote}</p>}
      </section>
      <dl className="answer-list">
        {def.pages.flatMap(p => p.questions).filter(q => q.kind !== "statement" && answer.data[q.id] !== undefined).map(q => (
          <div key={q.id} className="answer-item">
            <dt>{q.title}</dt>
            <dd><span className="answer-text">{q.kind === "file" ? filesIn(answer.data[q.id]).map(f => f.name).join(", ") : answerText(q, answer.data[q.id], words)}</span></dd>
          </div>
        ))}
      </dl>
      <p><a className="button quiet" href={`/chest/f/${slug}`}>{t.sent.again}</a></p>
    </div>
  );
}
