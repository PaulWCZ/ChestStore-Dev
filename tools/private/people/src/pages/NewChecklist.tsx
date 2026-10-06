import { isAddress } from "@argentic/chest-sdk/mail";
import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { weekdayNames } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { listArrivals } from "../lib/arrivals.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { listName } from "../lib/examples.ts";
import { listTemplates } from "../lib/journeys.ts";
import { mailState } from "../lib/mailing.ts";
import { membersByAddress } from "../lib/welcome.ts";
import { today } from "../lib/zone.ts";
import { isKind, memberPattern } from "../shared/model.ts";
import { BackLink } from "./parts.tsx";

// Starting a checklist: for whom, from which template, from which day. The
// person's start date is offered for an arrival.
export async function newChecklistPage({ member, locale, t, query }: PageContext): Promise<View> {
  if (!can(member, "checklists.manage")) return notFound();
  const sql = db();
  const [{ entries }, templates, told, mailing] = await Promise.all([directory(sql, member), listTemplates(sql, member), listArrivals(sql, member), mailState()]);
  const arrivals = told.filter(a => a.status === "expected");
  // An arrival whose work address is already a member's gets the welcome
  // as a notification, never an email (lib/welcome.ts); null: the Chest
  // could not say, and the form promises nothing.
  const inChest = await membersByAddress(arrivals.map(a => a.workEmail));
  const asked = arrivals.find(a => a.id === query("arrival"));
  const personAsked = query("person") ?? "";
  const person = asked ? "arrival:" + asked.id : memberPattern.test(personAsked) ? personAsked : "";
  const kindAsked = query("kind");
  const kind = asked ? "onboarding" : isKind(kindAsked) ? kindAsked : "onboarding";
  return {
    title: t.start.title,
    body: (
      <div className="page narrow">
        <BackLink href="/chest/checklists">{t.checklists.title}</BackLink>
        <h1 className="edit-title">{t.start.title}</h1>
        {templates.length === 0 ? (
          <EmptyState title={t.start.noTemplates} action={<a className="button" href="/chest/checklists">{t.start.newTemplate}</a>} />
        ) : (
          <Island
            name="StartForm"
            props={{
              people: entries.map(e => ({ id: e.id, name: e.name, startDate: e.startDate })),
              arrivals: arrivals.map(a => ({ id: "arrival:" + a.id, name: a.name, startDate: a.startDate, managerId: a.managerId, mailable: a.workEmail !== "" && isAddress(a.workEmail), inChest: inChest === null ? null : a.workEmail in inChest })),
              templates: templates.map(x => ({ id: x.id, name: listName(x, t), kind: x.kind, steps: x.items.length })),
              initial: { person, kind, template: query("template") ?? "" },
              today: today(),
              weekdays: weekdayNames(locale),
              lang: locale,
              mailing,
              t: { start: t.start, kinds: t.checklists.kinds, group: t.arrivals.group, date: t.date, peoplePicker: t.peoplePicker, leaveEmpty: t.people.leaveEmpty },
            }}
          />
        )}
      </div>
    ),
  };
}
