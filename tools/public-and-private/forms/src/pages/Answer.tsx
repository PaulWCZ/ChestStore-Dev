import { Island } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Back, Next, Paperclip } from "../components/icons.tsx";
import { format, size, when, dayWords } from "../i18n/index.ts";
import { atLeast } from "../lib/access.ts";
import { neighbours, oneAnswer } from "../lib/answers.ts";
import { open, versions } from "../lib/forms.ts";
import { nameOf, people } from "../lib/people.ts";
import { answerText, filesIn, type StoredFile } from "../shared/logic.ts";
import { readIn } from "../shared/model.ts";
import { columnsOf } from "../shared/summary.ts";
import { filterOf } from "./Answers.tsx";
import type { Ctx } from "./context.ts";
import { FormFrame } from "./form-frame.tsx";

// The link to Clients or Support while that tool is installed (none
// otherwise: the words alone).
function toolLink(name: string, path: string): string | null {
  try {
    return chest.tools.link(name, path);
  } catch {
    return null;
  }
}

// One answer, every question of the version it answered, in order; then
// questions removed since that it answered. Newer and older step through
// the list as it was filtered. Editors follow it up (new, in progress,
// done, a note — which the person who sent a team form reads).
export async function answerPage({ sql, member, t, lang, zone, param, query }: Ctx) {
  const { form: frame, level } = await open(sql, member, param("id"));
  const { form, answer, definition, deleted } = await oneAnswer(sql, member, frame.id, param("answer"));
  const f = filterOf(query);
  const near = deleted ? { newer: null, older: null } : await neighbours(sql, member, form.id, answer.id, { q: f.q, question: f.question, option: f.option, status: f.status, from: f.from, to: f.to, sort: f.sort }, zone);
  const keep = new URLSearchParams(Object.entries({ q: f.q, where: f.where, status: f.status, from: f.from, to: f.to, sort: f.sort, cols: query("cols") ?? "" }).filter(([, v]) => v !== ""));
  const suffix = keep.size ? "?" + keep : "";
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const who = answer.respondent ? nameOf((await people([answer.respondent])).get(answer.respondent), lang) : (answer.email ?? t.answers.visitor);
  const said = answer.createdAt ? when(answer.createdAt, lang, zone, { long: true }) : dayWords(answer.month, lang, { month: "long", year: "numeric" });
  // The questions in the member's language when the form has it.
  const asked = readIn(definition, lang).pages.flatMap(p => p.questions).filter(q => q.kind !== "statement");
  const inVersion = new Set(asked.map(q => q.id));
  const others = columnsOf(await versions(sql, form.id)).filter(c => !inVersion.has(c.question.id) && answer.data[c.question.id] !== undefined).map(c => c.question);
  const base = `/chest/forms/${form.id}/answers`;
  const where = { "forms.contact": ["contact", toolLink("crm", "/chest/contacts")], "forms.request": ["request", toolLink("helpdesk", "/chest")], webhooks: ["webhooks", null], copy: ["copy", null] } as const;
  const places = answer.sent.filter((x): x is keyof typeof where => x in where).map(x => ({ key: x, label: t.answers.sentPlaces[where[x][0]], href: where[x][1] }));
  // A ticket in Support is followed up there: no second state here.
  const inSupport = answer.sent.includes("forms.request");
  const editor = atLeast(level, "editor");
  return {
    title: who,
    body: (
      <FormFrame form={frame} level={level} tab="answers" t={t} lang={lang}>
        <div className="answer-page">
          <div className="answer-nav">
            <a className="back-link" href={`${base}${suffix}`}><Back />{t.answers.back}</a>
            <span className="spacer" />
            {near.newer ? <a className="button quiet small" href={`${base}/${near.newer}${suffix}`}><Back />{f.sort ? t.answers.previousOldest : t.answers.previous}</a> : null}
            {near.older ? <a className="button quiet small" href={`${base}/${near.older}${suffix}`}>{f.sort ? t.answers.nextOldest : t.answers.next}<Next /></a> : null}
          </div>
          <header className="answer-head">
            <h2>{answer.email && !answer.respondent ? <a href={`mailto:${answer.email}`}>{who}</a> : who}</h2>
            <p className="answer-when">{said}</p>
            {form.version > 1 && <p className="hint">{format(t.answers.version, { n: answer.version })}</p>}
          </header>
          {deleted && <p className="notice" role="status">{t.answers.deletedState}</p>}
          {/* Where it went besides Forms (src/lib/respond.ts): Clients and
              Support link to their tool while it is installed. */}
          {places.length > 0 && (
            <p className="answer-sent">
              <span className="dim">{t.answers.sentTo}</span>{" "}
              {places.map((x, i) => <span key={x.key}>{i > 0 ? " · " : ""}{x.href ? <a href={x.href} target="_blank" rel="noopener">{x.label}</a> : x.label}</span>)}
            </p>
          )}
          <dl className="answer-list">
            {[...asked, ...others].map(q => {
              const value = answer.data[q.id];
              const kept = q.kind === "file" ? (filesIn(value).filter(x => "file" in x) as StoredFile[]) : [];
              return (
                <div key={q.id} className="answer-item">
                  <dt>{q.title}{!inVersion.has(q.id) && <span className="tag">{t.answers.removedQuestion}</span>}</dt>
                  <dd>
                    {value === undefined ? <span className="dim">{t.answers.noAnswer}</span>
                      : kept.length > 0 ? kept.map((file, i) => <a key={file.file} className="file-link" href={`/chest/forms/${form.id}/files/${answer.id}/${q.id}${kept.length > 1 ? `?n=${i}` : ""}`} target="_blank" rel="noreferrer"><Paperclip />{file.name} <span className="dim">{format(t.answers.fileSize, { size: size(file.size, lang) })}</span></a>)
                      : <span className="answer-text">{answerText(q, value, words)}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
          {inSupport && !deleted && <p className="hint">{t.answers.followedInSupport}</p>}
          {!deleted && !inSupport && (editor || answer.note) && (
            <Island id={`follow-${answer.id}`} name="FollowUp" props={{ formId: form.id, answerId: answer.id, status: answer.status, note: answer.note, canEdit: editor, team: form.audience === "team", t: { f: t.follow } }} />
          )}
          {editor && <Island id={`actions-${answer.id}`} name="AnswerActions" props={{ formId: form.id, answerId: answer.id, deleted, t: { delete: t.answers.delete, deleted: t.answers.deleted, restore: t.answers.restore } }} />}
        </div>
      </FormFrame>
    ),
  };
}
