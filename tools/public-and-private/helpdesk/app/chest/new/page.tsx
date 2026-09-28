import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { NewTicket } from "./new-ticket.tsx";

// A ticket for a customer who called or came by.
export default async function NewTicketPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  return (
    <div className="boxes">
      <div className="stack">
        <h1>{t.create.title}</h1>
        <p className="muted">{t.create.intro}</p>
      </div>
      {can(member, "tickets.answer") ? <NewTicket locale={locale} t={{ create: t.create, errors: t.errors }} /> : <p className="notice">{t.ticket.cannotAnswer}</p>}
    </div>
  );
}
