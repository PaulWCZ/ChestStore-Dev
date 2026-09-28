import * as chest from "@argentic/chest-sdk/chest";
import { Back, Paperclip } from "../../../../../../../components/icons.tsx";
import { atLeast } from "../../../../../../../lib/access.ts";
import { oneAnswer } from "../../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../../lib/app-error.ts";
import { db } from "../../../../../../../lib/db.ts";
import { open, versions } from "../../../../../../../lib/forms.ts";
import { format, formatDate } from "../../../../../../../lib/i18n/index.ts";
import { answerText, type StoredFile } from "../../../../../../../lib/logic.ts";
import { nameOf, people } from "../../../../../../../lib/people.ts";
import { viewer } from "../../../../../../../lib/session.ts";
import { columnsOf } from "../../../../../../../lib/summary.ts";
import { notFound } from "next/navigation";
import { AnswerActions } from "./answer-actions.tsx";

// One answer, every question of the version it answered, in order; then
// questions added since ("Not asked") are left out, removed ones kept.
export default async function AnswerPage({ params }: { params: Promise<{ id: string; answer: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const { id, answer: answerId } = await params;
  const { level } = await open(sql, member, id);
  const found = await oneAnswer(sql, member, id, answerId).catch(error => {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "too_few")) return null;
    throw error;
  });
  if (!found) notFound();
  const { form, answer, definition, deleted } = found;
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const zone = chest.timeZone();
  const who = answer.respondent ? nameOf((await people([answer.respondent])).get(answer.respondent), locale) : form.anonymous ? t.answers.anonymous : (answer.email ?? t.answers.visitor);
  const when = answer.createdAt ? formatDate(answer.createdAt, locale, zone, { dateStyle: "full", timeStyle: "short" }) : formatDate(answer.month + "T12:00:00Z", locale, "UTC", { month: "long", year: "numeric" });
  const asked = definition.pages.flatMap(p => p.questions).filter(q => q.kind !== "statement");
  const inVersion = new Set(asked.map(q => q.id));
  const others = columnsOf(await versions(sql, form.id)).filter(c => !inVersion.has(c.question.id) && answer.data[c.question.id] !== undefined).map(c => c.question);
  const size = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { style: "unit", unit: n > 1 << 20 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(n > 1 << 20 ? n / (1 << 20) : Math.max(1, n / 1024));
  return (
    <div className="answer-page">
      <a className="back-link" href={`/chest/forms/${form.id}/answers`}><Back />{t.answers.back}</a>
      <header className="answer-head">
        <h2>{who}</h2>
        <p className="answer-when">{when}</p>
        {form.version > 1 && <p className="hint">{format(t.answers.version, { n: answer.version })}</p>}
      </header>
      {deleted && <p className="notice" role="status">{t.answers.deletedState}</p>}
      <dl className="answer-list">
        {[...asked, ...others].map(q => {
          const value = answer.data[q.id];
          const file = value && typeof value === "object" && "file" in value ? (value as StoredFile) : null;
          return (
            <div key={q.id} className="answer-item">
              <dt>{q.title}{!inVersion.has(q.id) && <span className="tag">{t.answers.removedQuestion}</span>}</dt>
              <dd>
                {value === undefined ? <span className="dim">{t.answers.noAnswer}</span>
                  : file ? <a className="file-link" href={`/chest/forms/${form.id}/files/${answer.id}/${q.id}`} target="_blank" rel="noreferrer"><Paperclip />{file.name} <span className="dim">{format(t.answers.fileSize, { size: size(file.size) })}</span></a>
                  : <span className="answer-text">{answerText(q, value, words)}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {atLeast(level, "editor") && <AnswerActions formId={form.id} answerId={answer.id} deleted={deleted} t={{ a: t.answers, errors: t.errors }} />}
    </div>
  );
}
