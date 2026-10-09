import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, isLocale, stamp, type Catalogue } from "../i18n/index.ts";
import type { Step } from "./model.ts";
import { company, publicOrigin, setMailState } from "./settings.ts";
import type { Subscriber } from "./subscribers.ts";
import { allComponents, inLocale } from "./components.ts";
import { chestLanguage } from "./languages.ts";
import { pick } from "./texts.ts";

// Email to subscribers — people outside the company — through the Chest's
// mail (Proposal (studio): the "mail" capability, chest.proposals.json),
// which the Chest sends through the company's own mail provider. Replies
// go to the company's reply address the owner set with that connector (the
// SDK's default Reply-To): the emails say so, and nothing comes back to the
// tool. On a Chest without mail, nothing is sent, the tool remembers it and
// the public page offers the feeds instead of the form. The words around
// the texts follow each subscriber's language; the texts too, when the team
// wrote them in it.

const wordsFor = (language: string): Catalogue => catalogue(isLocale(language) ? language : "en");
export const subscriberLink = (origin: string, token: string) => `${origin}/s/${token}`;

export type Outcome = "sent" | "none" | "later";

async function send(sql: Query, message: mail.Message): Promise<Outcome> {
  try {
    await mail.send(message);
    await setMailState(sql, "ok");
    return "sent";
  } catch (error) {
    if (error instanceof CapabilityNotGranted) {
      await setMailState(sql, "none");
      return "none";
    }
    if (error instanceof QuotaExceeded || error instanceof RateLimited || error instanceof Unavailable) return "later";
    throw error;
  }
}

// The first email of a subscription: the link that confirms it — or, to an
// address already confirmed, the link of its page.
export async function welcome(sql: Query, s: Subscriber, state: "new" | "pending" | "confirmed", origin: string): Promise<Outcome> {
  const t = wordsFor(s.language).mail;
  const name = company() || t.team;
  const link = subscriberLink(origin, s.token);
  const confirmed = state === "confirmed";
  const day = new Date().toISOString().slice(0, 10);
  return send(sql, {
    to: s.email,
    subject: format(confirmed ? t.alreadySubject : t.confirmSubject, { company: name }),
    text: format(confirmed ? t.alreadyBody : t.confirmBody, { company: name, link }),
    fromName: name,
    key: `welcome:${s.id}:${s.email.toLowerCase()}:${day}:${confirmed ? "c" : "p"}`,
  });
}

// Keys (SDK studio.15) name the message whole — never cut: the SDK sends a
// long one as its SHA-256. They carry the address too: the Chest refuses a
// key reused within a day for other recipients (key_conflict), and a
// subscriber's id can name another address after a restored database; with
// the address in it, a key can only ever mean one recipient.
type Queued = { incident_language: string | null;
  id: string; attempts: number; subscriber_id: string; email: string; language: string; token: string;
  update_id: string; status: Step; body: string; body_second: string | null; posted_at: Date;
  incident_id: string; kind: "incident" | "maintenance"; title: string; title_second: string | null; second_language: string | null; started_at: Date; ends_at: Date | null;
};

// The text of one update's email, in the subscriber's language.
export function updateEmail(q: Pick<Queued, "language" | "token" | "update_id" | "status" | "body" | "posted_at" | "incident_id" | "kind" | "title" | "started_at" | "ends_at"> & Partial<Pick<Queued, "body_second" | "title_second" | "second_language">> & { incident_language?: string | null }, components: string[], origin: string, zone: string): { subject: string; text: string } {
  const all = wordsFor(q.language);
  const t = all.mail;
  const name = company() || t.team;
  const languages = { language: q.incident_language ?? chestLanguage(), secondLanguage: q.second_language ?? null };
  const title = pick(q.title, q.title_second, languages, q.language).text;
  const body = pick(q.body, q.body_second, languages, q.language).text;
  const values = { company: name, title, step: all.steps[q.status] };
  const when = q.kind === "maintenance" && q.status === "scheduled" && q.ends_at
    ? format(t.window, { from: stamp(q.started_at, zone, q.language), to: stamp(q.ends_at, zone, q.language), zone })
    : format(t.when, { time: stamp(q.posted_at, zone, q.language), zone });
  return {
    subject: format(t.updateSubject, values),
    text: format(t.updateBody, {
      ...values,
      body,
      affected: components.length ? format(t.affected, { list: components.join(", ") }) : "",
      when,
      incident: `${origin}/incidents/${q.incident_id}`,
      manage: subscriberLink(origin, q.token),
    }),
  };
}

// flush sends what waits in the queue, oldest first, at most `limit`
// messages: right after an update (a few), then by the schedule. It stops
// at the Chest's daily quota and goes on at the next pass; a Chest without
// mail empties nothing — the queue waits a day, then is dropped.
export async function flush(sql: Sql, options: { limit?: number; now?: Date } = {}): Promise<{ sent: number; stopped: "quota" | "none" | null }> {
  const now = options.now ?? new Date();
  await sql`delete from mail_queue where created_at < ${new Date(now.getTime() - 86400000)} or attempts >= 5`;
  const batch = await sql<Queued[]>`
    select q.id, q.attempts, s.id as subscriber_id, s.email, s.language, s.token,
      u.id as update_id, u.status, u.body, u.body_second, u.posted_at, i.id as incident_id, i.kind, i.title, i.title_second, i.language as incident_language, i.second_language, i.started_at, i.ends_at
    from mail_queue q
      join subscribers s on s.id = q.subscriber_id and s.confirmed_at is not null
      join updates u on u.id = q.update_id and u.removed_at is null
      join incidents i on i.id = u.incident_id and i.removed_at is null
    order by q.id limit ${Math.min(Math.max(options.limit ?? 50, 1), 500)}`;
  if (batch.length === 0) return { sent: 0, stopped: null };
  const origin = await publicOrigin(sql);
  const zone = chest.timeZone;
  // Services named in each subscriber's language when written in it.
  const services = new Map((await allComponents(sql)).map(c => [c.id, c]));
  const nameIn = (id: string, language: string) => { const c = services.get(id); return c ? inLocale(c, language).name : undefined; };
  const incidentIds = [...new Set(batch.map(b => String(b.incident_id)))];
  const touched = await sql<{ incident_id: string; component_id: string }[]>`
    select u.incident_id, s.component_id from update_states s join updates u on u.id = s.update_id
    where u.incident_id = any(${incidentIds}::bigint[]) and u.removed_at is null
    union select incident_id, component_id from maintenance_components where incident_id = any(${incidentIds}::bigint[])`;
  let sent = 0;
  for (const q of batch) {
    const components = [...new Set(touched.filter(r => String(r.incident_id) === String(q.incident_id)).map(r => nameIn(String(r.component_id), q.language)).filter((n): n is string => Boolean(n)))];
    const { subject, text } = updateEmail(q, components, origin, zone);
    let outcome: Outcome;
    // The key carries the address and the update's time: after a restore,
    // an id may name another subscriber or another update (sdk/README, "Put
    // the recipient in the key").
    try {
      outcome = await send(sql, { to: q.email, subject, text, fromName: company() || wordsFor(q.language).mail.team, key: `update:${q.update_id}:${new Date(q.posted_at).getTime()}:${q.subscriber_id}:${q.email.toLowerCase()}` });
    } catch (error) {
      // An address the Chest refuses (bounced, complained, invalid): this
      // message is dropped, the next ones are tried.
      if (!(error instanceof ChestError)) throw error;
      await sql`delete from mail_queue where id = ${q.id}`;
      continue;
    }
    if (outcome === "none") return { sent, stopped: "none" };
    if (outcome === "later") {
      await sql`update mail_queue set attempts = attempts + 1 where id = ${q.id}`;
      return { sent, stopped: "quota" };
    }
    await sql`delete from mail_queue where id = ${q.id}`;
    sent++;
  }
  await sql`delete from mail_queue q where not exists (select 1 from subscribers s where s.id = q.subscriber_id and s.confirmed_at is not null)`;
  return { sent, stopped: null };
}

export async function queued(sql: Query): Promise<number> {
  const [{ count }] = (await sql<{ count: number }[]>`select count(*)::int as count from mail_queue`) as unknown as [{ count: number }];
  return count;
}
