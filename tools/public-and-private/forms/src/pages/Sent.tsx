import { Back } from "../components/icons.tsx";
import { FollowBadge } from "../components/state-badge.tsx";
import { format, when } from "../i18n/index.ts";
import { sentOne } from "../lib/answers.ts";
import { answerText, filesIn } from "../shared/logic.ts";
import { isLanguage, localize } from "../shared/model.ts";
import type { Ctx } from "./context.ts";

// What I sent: one of my own answers to a team form, as I sent it, and
// where it stands (new, in progress, done, with the note the form's people
// wrote). Read only; nobody else's (sentOne refuses: the 404 page).
export async function sentPage({ sql, member, t, lang, zone, param }: Ctx) {
  const found = await sentOne(sql, member, param("answer"));
  const { answer, slug } = found;
  const def = isLanguage(answer.language) ? localize(found.definition, answer.language) : found.definition;
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  return {
    title: def.title,
    body: (
      <div className="answer-page">
        <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
        <header className="answer-head">
          <h1 className="page-title">{def.title}</h1>
          <p className="answer-when">{format(t.sent.when, { when: answer.createdAt ? when(answer.createdAt, lang, zone, { long: true }) : "" })}</p>
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
    ),
  };
}
