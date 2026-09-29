import * as chest from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { Back, Next, Paperclip } from "../../../../../../../components/icons.tsx";
import { atLeast } from "../../../../../../../lib/access.ts";
import { neighbours, oneAnswer } from "../../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../../lib/app-error.ts";
import { db } from "../../../../../../../lib/db.ts";
import { versions } from "../../../../../../../lib/forms.ts";
import { format, formatDate } from "../../../../../../../lib/i18n/index.ts";
import { answerText, filesIn, type StoredFile } from "../../../../../../../lib/logic.ts";
import { nameOf, people } from "../../../../../../../lib/people.ts";
import { formOr404 } from "../../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../../lib/session.ts";
import { readIn } from "../../../../../../../lib/model.ts";
import { columnsOf } from "../../../../../../../lib/summary.ts";
import { AnswerActions, FollowUp } from "./answer-actions.tsx";

type Props = { params: Promise<{ id: string; answer: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// One answer, every question of the version it answered, in order; then
// questions removed since that it answered. Newer and older step through
// the list as it was filtered. Editors follow it up (new, in progress,
// done, a note — which the person who sent a team form reads).
export default async function AnswerPage({ params, searchParams }: Props) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const { id, answer: answerId } = await params;
  const query = Object.fromEntries(Object.entries(await searchParams).map(([k, x]) => [k, Array.isArray(x) ? x[0] : x]));
  const { level } = await formOr404(member, id);
  const found = await oneAnswer(sql, member, id, answerId).catch(error => {
    if (error instanceof AppError && error.code === "not_found") return null;
    throw error;
  });
  if (!found) notFound();
  const { form, answer, definition, deleted } = found;
  const zone = chest.timeZone();
  const filter = { q: query["q"], question: query["where"]?.split(":")[0], option: query["where"]?.split(":")[1], status: query["status"], from: query["from"], to: query["to"], sort: query["sort"] };
  const near = deleted ? { newer: null, older: null } : await neighbours(sql, member, id, answer.id, filter, zone);
  const keep = new URLSearchParams(Object.entries(query).filter(([k, x]) => k !== "page" && typeof x === "string") as [string, string][]);
  const suffix = keep.size ? "?" + keep : "";
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const who = answer.respondent ? nameOf((await people([answer.respondent])).get(answer.respondent), locale) : (answer.email ?? t.answers.visitor);
  const when = answer.createdAt ? formatDate(answer.createdAt, locale, zone, { dateStyle: "full", timeStyle: "short" }) : formatDate(answer.month + "T12:00:00Z", locale, "UTC", { month: "long", year: "numeric" });
  // The questions in the member's language when the form has it.
  const asked = readIn(definition, locale).pages.flatMap(p => p.questions).filter(q => q.kind !== "statement");
  const inVersion = new Set(asked.map(q => q.id));
  const others = columnsOf(await versions(sql, form.id)).filter(c => !inVersion.has(c.question.id) && answer.data[c.question.id] !== undefined).map(c => c.question);
  const size = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { style: "unit", unit: n > 1 << 20 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(n > 1 << 20 ? n / (1 << 20) : Math.max(1, n / 1024));
  const base = `/chest/forms/${form.id}/answers`;
  return (
    <div className="answer-page">
      <div className="answer-nav">
        <a className="back-link" href={`${base}${suffix}`}><Back />{t.answers.back}</a>
        <span className="spacer" />
        {near.newer ? <a className="button quiet small" href={`${base}/${near.newer}${suffix}`}><Back />{query["sort"] === "oldest" ? t.answers.previousOldest : t.answers.previous}</a> : null}
        {near.older ? <a className="button quiet small" href={`${base}/${near.older}${suffix}`}>{query["sort"] === "oldest" ? t.answers.nextOldest : t.answers.next}<Next /></a> : null}
      </div>
      <header className="answer-head">
        <h2>{answer.email && !answer.respondent ? <a href={`mailto:${answer.email}`}>{who}</a> : who}</h2>
        <p className="answer-when">{when}</p>
        {form.version > 1 && <p className="hint">{format(t.answers.version, { n: answer.version })}</p>}
      </header>
      {deleted && <p className="notice" role="status">{t.answers.deletedState}</p>}
      <dl className="answer-list">
        {[...asked, ...others].map(q => {
          const value = answer.data[q.id];
          const kept = q.kind === "file" ? (filesIn(value).filter(f => "file" in f) as StoredFile[]) : [];
          return (
            <div key={q.id} className="answer-item">
              <dt>{q.title}{!inVersion.has(q.id) && <span className="tag">{t.answers.removedQuestion}</span>}</dt>
              <dd>
                {value === undefined ? (<span className="dim">{t.answers.noAnswer}</span>)
                  : kept.length > 0 ? kept.map((file, i) => (<a key={file.file} className="file-link" href={`/chest/forms/${form.id}/files/${answer.id}/${q.id}${kept.length > 1 ? `?n=${i}` : ""}`} target="_blank" rel="noreferrer"><Paperclip />{file.name} <span className="dim">{format(t.answers.fileSize, { size: size(file.size) })}</span></a>))
                  : (<span className="answer-text">{answerText(q, value, words)}</span>)}
              </dd>
            </div>
          );
        })}
      </dl>
      {!deleted && (atLeast(level, "editor") || answer.note) && (
        <FollowUp formId={form.id} answerId={answer.id} status={answer.status} note={answer.note} canEdit={atLeast(level, "editor")} team={form.audience === "team"} locale={locale} t={{ f: t.follow, errors: t.errors }} />
      )}
      {atLeast(level, "editor") && <AnswerActions formId={form.id} answerId={answer.id} deleted={deleted} t={{ a: t.answers, errors: t.errors }} />}
    </div>
  );
}
