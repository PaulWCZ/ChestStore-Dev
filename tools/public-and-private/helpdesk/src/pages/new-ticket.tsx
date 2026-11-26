import { Island, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import { languageNames } from "../i18n/index.ts";
import { can } from "../lib/access.ts";

// A ticket for a customer who called or came by, /chest/new.
export function newTicketPage({ member, lang: locale, t }: TeamContext): View {
  return {
    title: t.create.title,
    body: (
      <div className="boxes">
        <PageHeader size="m" title={t.create.title} intro={t.create.intro} />
        {can(member, "tickets.answer") ? <Island name="NewTicket" props={{ locale, languages: Object.entries(languageNames).map(([code, name]) => ({ code, name })), t: t.create }} /> : <p className="notice">{t.ticket.cannotAnswer}</p>}
      </div>
    ),
  };
}
