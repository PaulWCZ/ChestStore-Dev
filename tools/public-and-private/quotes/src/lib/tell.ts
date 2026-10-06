import type { Member } from "@argentic/chest-sdk/member";
import { issuers } from "./access.ts";
import type { Query } from "./db.ts";
import type { Doc } from "./documents.ts";
import { issuerCount } from "./documents.ts";
import { format } from "../i18n/index.ts";
import { formatMoney } from "../shared/money.ts";
import { badges, notify, withdraw } from "./notify.ts";
import type { Answer } from "./online.ts";
import { holders } from "./people.ts";

// What the tool tells people inside the Chest. Billing hear, in the bell,
// that a salesperson handed them an invoice draft (withdrawn once it is
// finalised or deleted), and see on the tool's tile how many drafts wait
// for them and how many invoices are overdue — a true count, set again
// after every change and each morning (the "badges" schedule).

async function issuerIds(): Promise<string[]> {
  const found = await Promise.all(issuers.map(role => holders({ role })));
  return [...new Set(found.flat().map(h => h.id))];
}

export async function readyForBilling(actor: Member, doc: Doc, clientName: string): Promise<void> {
  const to = (await issuerIds()).filter(id => id !== actor.id);
  await notify(to, (t, locale) => ({
    title: format(t.notifications.readyTitle, { client: clientName }),
    body: format(t.notifications.readyBody, { name: actor.name, amount: formatMoney(doc.gross, doc.currency, locale) }),
  }), { path: `/chest/documents/${doc.id}`, key: `ready:${doc.id}` });
}

export async function settled(documentId: string): Promise<void> {
  await withdraw(`ready:${documentId}`);
}

export async function refreshBadges(sql: Query, today: string): Promise<void> {
  const count = await issuerCount(sql, today);
  const ids = await issuerIds();
  if (ids.length === 0) return;
  await badges(new Map(ids.map(id => [id, count])));
}

// A client answered a quote online: the person who wrote it, and the one
// who sent it, hear it in the bell (else everyone who writes quotes).
export async function answeredOnline(doc: Pick<Doc, "id" | "number" | "gross" | "currency" | "createdBy" | "sentBy">, answer: Pick<Answer, "answer" | "name" | "reason">): Promise<void> {
  let to = [doc.createdBy, doc.sentBy].filter((x): x is string => typeof x === "string" && x.startsWith("mbr_"));
  if (to.length === 0) to = (await Promise.all((["admin", "billing", "sales"] as const).map(role => holders({ role })))).flat().map(h => h.id);
  await notify(to, (t, locale) => ({
    title: format(answer.answer === "accepted" ? t.notifications.acceptedTitle : t.notifications.refusedTitle, { name: answer.name, number: doc.number ?? "" }),
    body: answer.answer === "accepted"
      ? format(t.notifications.acceptedBody, { amount: formatMoney(doc.gross, doc.currency, locale) })
      : answer.reason ? format(t.notifications.refusedBody, { reason: answer.reason }) : t.notifications.refusedNoReason,
  }), { path: `/chest/documents/${doc.id}`, key: `answer:${doc.id}` });
}
