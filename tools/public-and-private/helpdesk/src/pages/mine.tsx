import { AppError, Island, notFound, redirect, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, PageHeader } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import { StateBadge } from "../components/badges.tsx";
import { Body } from "../components/body.tsx";
import { Back, Clip, Reply } from "../components/icons.tsx";
import { fileSize, format, formatDate, relative } from "../i18n/index.ts";
import { toolLink } from "../lib/forms-in.ts";
import { nameOf, people } from "../lib/people.ts";
import { myRequest, myRequests } from "../lib/tickets.ts";

// My requests, /chest/mine: what this member asked the team (with a team
// form of Forms), newest first, the closed ones last — their own tickets
// only, whatever their role. Each opens their view of it: the answers,
// never the team's notes.
export async function minePage({ sql, member, lang: locale, t }: TeamContext): Promise<View> {
  const rows = await myRequests(sql, member);
  const w = t.mine;
  const now = new Date();
  // Requests are sent with a form of Forms: the way there, when it is
  // installed on this Chest.
  const forms = toolLink("forms", "/chest");
  return {
    title: w.title,
    body: (
      <>
        <PageHeader size="m" title={w.title} />
        {rows.length === 0 ? (
          <EmptyState icon={<Reply />} title={w.emptyTitle} body={w.emptyBody} action={forms ? <a className="ck-button" href={forms}>{w.openForms}</a> : undefined} />
        ) : (
          <ul className="tickets" aria-label={w.list}>
            {rows.map(r => (
              <li key={r.number} id={`r${r.number}`}>
                <a className="ticket-row mine" href={`/chest/mine/${r.number}`}>
                  <span className="subject"><span>{r.subject}</span></span>
                  <span className="meta">
                    <span className="num">#{r.number}</span>
                    <StateBadge status={r.status} label={t.public.statuses[r.status]} />
                  </span>
                  <span className="preview"><time dateTime={r.updatedAt}>{format(w.updated, { when: relative(r.updatedAt, locale, now) })}</time></span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </>
    ),
  };
}

// One of the member's own requests, /chest/mine/<number>, as they see it:
// their messages and the team's answers (never a note), its state, a box
// to write again, and once closed "Did we solve your problem?". Anyone
// else's ticket — or one that does not exist — is the same "not found".
export async function myRequestPage({ sql, member, lang: locale, t, f }: TeamContext, asked: string): Promise<View> {
  let ticket;
  try {
    ticket = await myRequest(sql, member, asked);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  // Merged into another of theirs: its conversation is there now.
  if (String(ticket.number) !== asked) redirect(`/chest/mine/${ticket.number}`);
  const w = t.mine;
  const who = await people(ticket.messages.filter(m => m.kind === "reply" && m.author).map(m => m.author!));
  const name = (author: string | null) => (author === "erased" ? t.people.erased : nameOf(author ? who.get(author) : undefined, locale));
  const title = format(w.requestTitle, { number: ticket.number });
  return {
    title: ticket.subject,
    body: (
      <div className="mine-request">
        <div className="ticket-head">
          <a className="back" href="/chest/mine"><Back />{w.back}</a>
          <h1>{ticket.subject}</h1>
          <p className="row muted small"><span>{title}</span><StateBadge status={ticket.status} label={t.public.statuses[ticket.status]} /></p>
        </div>
        <ol className="thread" aria-label={title}>
          {ticket.messages.map(m => {
            const author = m.kind === "customer" ? member.name : name(m.author);
            return (
              <li key={m.id} id={`m${m.id}`} className={bubble(m.kind)}>
                <Avatar name={author} photo={m.kind === "customer" ? member.photo : m.author ? who.get(m.author)?.photo ?? null : null} />
                <div className="bubble">
                  <div className="who">{m.kind === "customer" ? w.you : author} <time dateTime={m.at}>{formatDate(m.at, locale, f.timeZone, { dateStyle: "medium", timeStyle: "short" })}</time></div>
                  <Body text={m.body} />
                  {m.attachments.length > 0 && (
                    <div className="files" aria-label={t.kit.files.list}>
                      {m.attachments.map(a => <a key={a.id} href={`/chest/mine/${ticket.number}/files/${a.id}`} rel="noreferrer" download><Clip />{a.fileName}<span className="size">{fileSize(a.size, locale)}</span></a>)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {ticket.status === "closed" && <Island name="Rate" props={{ number: ticket.number, rating: ticket.rating, team: true, t: { rateTitle: t.public.rateTitle, rateGood: t.public.rateGood, rateBad: t.public.rateBad, rated: t.public.rated } }} />}
        <section className="public-card" aria-labelledby="again">
          <h2 id="again">{w.reply}</h2>
          {ticket.status === "closed" && <p className="hint">{w.reopenHint}</p>}
          <Island name="MineReply" props={{ number: ticket.number, t: { mine: w, errors: t.errors, files: t.kit.files, typesPlain: t.public.typesPlain } }} />
        </section>
      </div>
    ),
  };
}

// The customer's words on the left; the team's answers on the right, in
// the team's tint.
const bubble = (kind: string) => (kind === "customer" ? "msg" : "msg team");
