import { Avatar } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StateBadge } from "../../../../components/badges.tsx";
import { Body } from "../../../../components/body.tsx";
import { Back, Clip } from "../../../../components/icons.tsx";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { fileSize, format, formatDate } from "../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { myRequest } from "../../../../lib/tickets.ts";
import { MineReply, MineRate } from "./mine-reply.tsx";

// One of the member's own requests, as they see it: their messages and the
// team's answers (never a note), its state, a box to write again, and once
// closed "Did we solve your problem?". Anyone else's ticket — or one that
// does not exist — is the same "not found".
export default async function MyRequestPage({ params }: { params: Promise<{ number: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const asked = (await params).number;
  let ticket;
  try {
    ticket = await myRequest(db(), member, asked);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  // Merged into another of theirs: its conversation is there now.
  if (String(ticket.number) !== asked) redirect(`/chest/mine/${ticket.number}`);
  const w = t.mine;
  const who = await people(ticket.messages.filter(m => m.kind === "reply" && m.author).map(m => m.author!));
  const name = (author: string | null) => (author === "erased" ? t.people.erased : nameOf(author ? who.get(author) : undefined, locale));
  return (
    <div className="mine-request">
      <div className="ticket-head">
        <Link className="back" href="/chest/mine"><Back />{w.back}</Link>
        <h1>{ticket.subject}</h1>
        <p className="row muted small"><span>{format(w.requestTitle, { number: ticket.number })}</span><StateBadge status={ticket.status} label={t.public.statuses[ticket.status]} /></p>
      </div>
      <ol className="thread" aria-label={format(w.requestTitle, { number: ticket.number })}>
        {ticket.messages.map(m => {
          const author = m.kind === "customer" ? member.name : name(m.author);
          return (
            <li key={m.id} className={`msg ${m.kind === "customer" ? "" : "team"}`}>
              <Avatar name={author} photo={m.kind === "customer" ? member.photo : m.author ? who.get(m.author)?.photo ?? null : null} />
              <div className="bubble">
                <div className="who">{m.kind === "customer" ? w.you : author} <time dateTime={m.at}>{formatDate(m.at, locale, { dateStyle: "medium", timeStyle: "short" })}</time></div>
                <Body text={m.body} />
                {m.attachments.length > 0 && (
                  <div className="files" aria-label={t.files.list}>
                    {m.attachments.map(a => <a key={a.id} href={`/chest/mine/${ticket.number}/files/${a.id}`} rel="noreferrer"><Clip />{a.fileName}<span className="size">{fileSize(a.size, locale)}</span></a>)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {ticket.status === "closed" && <MineRate number={ticket.number} rating={ticket.rating} t={t.public} />}
      <section className="public-card" aria-labelledby="again">
        <h2 id="again">{w.reply}</h2>
        {ticket.status === "closed" && <p className="hint">{w.reopenHint}</p>}
        <MineReply number={ticket.number} t={{ mine: w, errors: t.errors, files: t.files, typesPlain: t.public.typesPlain }} />
      </section>
    </div>
  );
}
