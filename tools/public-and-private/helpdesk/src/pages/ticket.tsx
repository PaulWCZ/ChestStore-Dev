import { chest } from "@argentic/chest-sdk/chest";
import { AppError, Island, notFound, redirect, type View } from "@argentic/chest-app";
import { Avatar } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import { PriorityChip, StateBadge, Waiting } from "../components/badges.tsx";
import { Body } from "../components/body.tsx";
import { Alert, Back, Check, Clip, Download, Eye, Globe, Mail } from "../components/icons.tsx";
import { IncidentBanner } from "../components/incident-banner.tsx";
import { fileSize, format, formatDate, plural, relative } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { formsLink } from "../lib/forms-in.ts";
import { incidentReplies, openIncidents } from "../lib/incidents-in.ts";
import { fillReply, lateAfter, readMerged, waitedFor } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { answerers, colleagueName } from "../lib/tell.ts";
import { savedReplies, settings, tags, ticket as readTicket } from "../lib/tickets.ts";
import { workMinutes } from "../shared/hours.ts";

// Images the Chest makes thumbnails of: shown in the thread.
const thumbnailTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// One ticket, /chest/tickets/<number>: the conversation (drawn here), the
// answer box — a reply or an internal note — (the Composer island), and
// beside it who it is from, who has it, its priority, tags and state (the
// TicketSide island). Sending clears the box; a refusal keeps the text.
export async function ticketPage({ sql, member, lang: locale, t, f }: TeamContext, number: string): Promise<View> {
  let ticket;
  try {
    ticket = await readTicket(sql, member, number);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  // A ticket merged into another: its conversation is there now.
  if (ticket.mergedInto !== null) redirect(`/chest/tickets/${ticket.mergedInto}`);
  const team = await answerers();
  const authors = ticket.messages.map(m => m.author).filter((a): a is string => !!a && a.startsWith("mbr_"));
  const who = await people([...team, ...authors, ...ticket.viewing, ...(ticket.assignee ? [ticket.assignee] : []), ...(ticket.requester ? [ticket.requester] : [])]);
  const name = (id: string | null) => (id === member.id ? t.people.you : id === "erased" ? t.people.erased : nameOf(id ? who.get(id) : undefined, locale));
  // A colleague's request (a team form of Forms) names them as the Chest does.
  const requester = ticket.requester ? (ticket.requester === "erased" ? t.people.erased : colleagueName(who.get(ticket.requester), t, locale)) : null;
  const filled = { customer: (requester ? "" : ticket.customerName).split(" ")[0] || "", agent: member.firstName || member.name };
  // While Status says an incident is in progress: a line above the
  // conversation, and a saved reply that tells the customer (first).
  const [replies, tagList, s, incidents, incidentAnswers] = await Promise.all([savedReplies(sql, member), tags(sql, member), settings(sql), openIncidents(sql, member, locale), incidentReplies(sql, member, ticket.language, filled, locale)]);
  const now = new Date();
  const minutes = ticket.waitingSince ? workMinutes(ticket.waitingSince, now, s.hours, chest.timeZone) : 0;
  const wait = ticket.waitingSince ? waitedFor(minutes) : null;
  const customer = requester ?? (ticket.customerName || ticket.customerEmail);
  const w = t.ticket;
  // Why an email did not arrive, as the Chest's mail.status said it (an
  // earlier version kept the mail server's own words: shown as they are).
  const bounceReason = (reason: string) => w.bounceReasons[reason as keyof typeof w.bounceReasons] ?? reason;
  const canAnswer = can(member, "tickets.answer");
  const canManage = can(member, "tickets.manage");
  const waiting = wait ? { text: plural(t.waiting[wait.unit], wait.count, locale), late: lateAfter(minutes, s.lateHours), lateText: format(t.waiting.late, { hours: s.lateHours }) } : null;
  const longDate = (at: string) => formatDate(at, locale, f.timeZone, { dateStyle: "full", timeStyle: "short" });
  // An answer not emailed: on the customer's follow-up page, or — a
  // colleague's request — kept in Support (they hear of it in the bell).
  const onPage = ticket.requester
    ? <><Check /><span title={w.colleagueHint}>{w.viaColleague}</span></>
    : <><Globe /><span title={w.viaPageHint}>{w.viaPage}</span></>;
  return {
    title: ticket.subject,
    body: (
      <div className="ticket">
        <div>
          <div className="ticket-head">
            <a className="back" href="/chest"><Back />{w.back}</a>
            <h1>{ticket.subject}</h1>
            <p className="row muted small"><span>#{ticket.number}</span><StateBadge status={ticket.status} label={w.statuses[ticket.status]} /><PriorityChip priority={ticket.priority} label={t.priority[ticket.priority]} />{waiting && <Waiting {...waiting} />}<span>{w.channel[ticket.channel]}</span><span>{formatDate(ticket.createdAt, locale, f.timeZone, { dateStyle: "long", timeStyle: "short" })}</span></p>
            {ticket.source && (() => {
              const href = formsLink(ticket.source.answer.path);
              const said = format(w.fromForm, { form: ticket.source.form.title });
              return <p className="small muted">{href ? <a href={href} target="_blank" rel="noopener" title={w.fromFormLink}>{said}</a> : said}</p>;
            })()}
            {ticket.viewing.length > 0 && <p className="viewing" role="status"><Eye />{format(ticket.viewing.length > 1 ? w.viewingMany : w.viewing, { names: ticket.viewing.map(id => name(id)).join(", ") })}</p>}
          </div>
          <IncidentBanner incidents={incidents} t={t.incident} />
          {ticket.bounce && (
            <div className="notice danger" role="alert"><Alert /><div className="stack tight"><strong>{format(w.bounceBanner, { email: ticket.customerEmail })}</strong>{ticket.bounce.reason && ticket.bounce.reason !== "suppressed" && <span className="small muted">{bounceReason(ticket.bounce.reason)}</span>}<span className="small">{w.bounceHint}</span></div></div>
          )}
          <ol className="thread">
            {ticket.messages.map(m => {
              if (m.kind === "event") {
                const merged = readMerged(m.body);
                return <li key={m.id} id={`m${m.id}`} className="event"><span>{merged ? format(w.mergedEvent, { number: merged.number }) : m.body}</span> <time dateTime={m.at} title={longDate(m.at)}>{relative(m.at, locale, now)}</time></li>;
              }
              const author = m.kind === "customer" ? customer : name(m.author);
              return (
                <li key={m.id} id={`m${m.id}`} className={classes(m)}>
                  <Avatar name={author} photo={m.author ? who.get(m.author)?.photo ?? null : null} />
                  <div className="bubble">
                    <div className="who">{author}{m.kind === "note" && <span className="chip note-chip">{w.noteTag}</span>}<time dateTime={m.at} title={longDate(m.at)}>{relative(m.at, locale, now)}</time></div>
                    {m.kind === "customer" && m.author && <p className="small muted">{m.author === member.id ? w.typedByYou : format(w.typedBy, { name: name(m.author) })}</p>}
                    <Body text={m.body} contacts />
                    {m.attachments.some(a => thumbnailTypes.includes(a.type)) && (
                      <div className="thumbs">
                        {m.attachments.filter(a => thumbnailTypes.includes(a.type)).map(a => <a key={a.id} href={`/chest/files/${a.id}`} target="_blank" rel="noopener"><img src={`/chest/files/${a.id}?thumbnail=1`} alt={format(w.image, { name: a.fileName })} loading="lazy" /></a>)}
                      </div>
                    )}
                    {m.attachments.length > 0 && (
                      <div className="files" aria-label={w.files}>
                        {m.attachments.map(a => <a key={a.id} href={`/chest/files/${a.id}`} target="_blank" rel="noopener"><Clip />{a.fileName}<span className="size">{fileSize(a.size, locale)}</span></a>)}
                      </div>
                    )}
                    {m.kind === "reply" && m.bounce && <p className="delivery bounced"><Alert />{m.bounce.reason === "suppressed" ? w.suppressed : format(w.bounced, { reason: bounceReason(m.bounce.reason) })}</p>}
                    {m.kind === "reply" && !m.bounce && m.delivery && <p className="delivery">{m.delivery === "email" ? <><Mail />{w.viaEmail}</> : onPage}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {canAnswer ? (
            <Island name="Composer" props={{
              number: ticket.number,
              // A colleague's request is answered in My requests, never by email.
              theirs: !ticket.requester && ticket.status !== "spam",
              replies: [...incidentAnswers.map(r => ({ id: r.id, title: r.title, filled: r.filled })), ...replies.map(r => ({ id: r.id, title: r.title, filled: fillReply(r.body, filled) }))],
              t: {
                answerAs: w.answerAs, reply: w.reply, note: w.note, replyPlaceholder: w.replyPlaceholder, notePlaceholder: w.notePlaceholder, files: w.files, send: w.send, sendClose: w.sendClose, addNote: w.addNote,
                theirEmail: w.theirEmail, theirEmailPlaceholder: w.theirEmailPlaceholder, addTheirEmail: w.addTheirEmail, theirEmailToast: w.theirEmailToast,
                saved: w.saved, noSaved: w.noSaved, noteToast: w.noteToast, sentColleagueToast: w.sentColleagueToast, sentClosedToast: w.sentClosedToast, viaPage: w.viaPage, sentToast: w.sentToast, closedToast: w.closedToast,
                typesPlain: t.public.typesPlain, wait: t.kit.files.wait, fileWords: t.kit.files, errors: t.errors,
              },
            }} />
          ) : <p className="notice">{w.cannotAnswer}</p>}
        </div>
        <Island name="TicketSide" props={{
          ticket: { number: ticket.number, status: ticket.status, customerName: ticket.customerName, customerEmail: ticket.customerEmail, requester, assignee: ticket.assignee, priority: ticket.priority, tags: ticket.tags, rating: ticket.rating },
          tagNames: tagList.map(g => g.name),
          others: ticket.others.map(o => ({ number: o.number, subject: o.subject, status: o.status, when: relative(o.updatedAt, locale, now) })),
          team: team.map(id => ({ id, name: name(id), photo: who.get(id)?.photo ?? null })),
          me: member.id,
          canAnswer,
          canManage,
          locale,
          t: { ticket: w, priority: t.priority, peoplePicker: t.kit.peoplePicker },
        }} />
      </div>
    ),
  };
}

// A message's bubble: the customer's on the left; the team's (a reply, a
// note on the marker's yellow) on the right.
function classes(m: { kind: string }): string {
  return ["msg", m.kind !== "customer" && "team", m.kind === "note" && "note"].filter(Boolean).join(" ");
}
