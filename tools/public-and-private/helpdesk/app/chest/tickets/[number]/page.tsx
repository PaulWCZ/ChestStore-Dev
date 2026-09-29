import * as chest from "@argentic/chest-sdk/chest";
import { notFound, redirect } from "next/navigation";
import { answerers } from "../../../../lib/tell.ts";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { fileSize, format, formatDate, plural, relative } from "../../../../lib/i18n/index.ts";
import { workMinutes } from "../../../../lib/hours.ts";
import { fillReply, lateAfter, readMerged, waitedFor } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { savedReplies, settings, tags, ticket as readTicket } from "../../../../lib/tickets.ts";
import { TicketView } from "./ticket-view.tsx";

// Images the Chest makes thumbnails of: shown in the thread.
const thumbnailTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// One ticket: the conversation, the answer box (reply or internal note),
// and beside it who it is from, who has it, its state.
export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  let ticket;
  try {
    ticket = await readTicket(sql, member, (await params).number);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  // A ticket merged into another: its conversation is there now.
  if (ticket.mergedInto !== null) redirect(`/chest/tickets/${ticket.mergedInto}`);
  const team = await answerers();
  const authors = ticket.messages.map(m => m.author).filter((a): a is string => !!a && a.startsWith("mbr_"));
  const who = await people([...team, ...authors, ...ticket.viewing, ...(ticket.assignee ? [ticket.assignee] : [])]);
  const name = (id: string | null) => (id === member.id ? t.people.you : id === "erased" ? t.people.erased : nameOf(id ? who.get(id) : undefined, locale));
  const [replies, tagList, s] = await Promise.all([savedReplies(sql, member), tags(sql, member), settings(sql)]);
  const now = new Date();
  const minutes = ticket.waitingSince ? workMinutes(ticket.waitingSince, now, s.hours, chest.timeZone()) : 0;
  const wait = ticket.waitingSince ? waitedFor(minutes) : null;
  const customer = ticket.customerName || ticket.customerEmail;
  return (
    <TicketView
      ticket={{
        number: ticket.number,
        subject: ticket.subject,
        status: ticket.status,
        channel: ticket.channel,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        assignee: ticket.assignee,
        created: formatDate(ticket.createdAt, locale, { dateStyle: "long", timeStyle: "short" }),
        priority: ticket.priority,
        tags: ticket.tags,
        bounce: ticket.bounce ? { permanent: ticket.bounce.permanent, reason: ticket.bounce.reason === "suppressed" ? "" : ticket.bounce.reason } : null,
        rating: ticket.rating,
        waiting: wait ? { text: plural(t.waiting[wait.unit], wait.count, locale), late: lateAfter(minutes, s.lateHours), lateText: format(t.waiting.late, { hours: s.lateHours }) } : null,
      }}
      tagNames={tagList.map(g => g.name)}
      messages={ticket.messages.map(m => ({
        id: m.id,
        kind: m.kind,
        who: m.kind === "customer" ? (m.mailFrom && m.mailFrom.toLowerCase() !== ticket.customerEmail.toLowerCase() ? m.mailFrom : customer) : name(m.author),
        event: m.kind === "event" && readMerged(m.body) ? format(t.ticket.mergedEvent, { number: readMerged(m.body)!.number }) : null,
        fromOther: m.kind === "customer" && m.mailFrom && m.mailFrom.toLowerCase() !== ticket.customerEmail.toLowerCase() ? format(t.ticket.fromOther, { email: m.mailFrom }) : null,
        email: m.emailId !== null && m.kind === "customer",
        html: m.html,
        original: m.original,
        auto: m.auto,
        dropped: m.dropped.map(d => format(t.ticket.dropped, { name: d.name, reason: t.ticket.droppedReasons[d.reason as "count"] ?? d.reason })),
        bounce: m.bounce ? (m.bounce.reason === "suppressed" ? t.ticket.suppressed : format(m.bounce.permanent ? t.ticket.bounced : t.ticket.bouncedLater, { reason: m.bounce.reason })) : null,
        typedBy: m.kind === "customer" && m.author ? format(t.ticket.typedBy, { name: name(m.author) }) : null,
        photo: m.author ? who.get(m.author)?.photo ?? null : null,
        body: m.body,
        when: relative(m.at, locale, now),
        date: formatDate(m.at, locale, { dateStyle: "full", timeStyle: "short" }),
        delivery: m.delivery,
        attachments: m.attachments.map(a => ({ id: a.id, fileName: a.fileName, size: fileSize(a.size, locale), image: thumbnailTypes.includes(a.type) })),
      }))}
      others={ticket.others.map(o => ({ ...o, when: relative(o.updatedAt, locale, now) }))}
      viewing={ticket.viewing.map(id => name(id))}
      team={team.map(id => ({ id, name: name(id), photo: who.get(id)?.photo ?? null }))}
      replies={replies.map(r => ({ ...r, filled: fillReply(r.body, { customer: ticket.customerName.split(" ")[0] || "", agent: member.firstName || member.name }) }))}
      me={member.id}
      canAnswer={can(member, "tickets.answer")}
      canManage={can(member, "tickets.manage")}
      locale={locale}
      t={{ ticket: t.ticket, errors: t.errors, people: t.people, priority: t.priority, files: t.files, peoplePicker: t.peoplePicker }}
    />
  );
}
