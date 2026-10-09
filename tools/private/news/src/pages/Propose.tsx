import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { format } from "../i18n/index.ts";
import { everyone } from "../lib/audience.ts";
import { dates } from "../lib/dates.ts";
import { db } from "../lib/db.ts";
import { mine, proposalLimits } from "../lib/proposals.ts";
import { chestZone } from "../lib/zone.ts";

// "Share something" (everyone): propose a shout-out or a piece of news; a
// publisher publishes it (src/lib/proposals.ts). Below, one's own proposals:
// waiting (take it back), or not published (with the reason, if given).
export async function proposePage({ member, locale, t, query }: PageContext): Promise<View> {
  const zone = chestZone();
  const sql = db();
  const [own, all] = await Promise.all([mine(sql, member), everyone()]);
  const colleagues = all.people.filter(p => p.id !== member.id).map(p => ({ id: p.id, name: p.name }));
  const d = dates(locale, zone);
  const w = t.propose;
  return { title: w.title, body: (
    <div className="narrow propose">
      <h1>{w.title}</h1>
      <p className="lead">{w.lead}</p>
      <Island name="ProposeForm" props={{ colleagues, start: query("kind") === "info" ? "info" : "shoutout", waitingMax: proposalLimits.waitingPerAuthor, locale, t: { propose: w, errors: t.errors, peoplePicker: t.kit.peoplePicker } }} />
      {own.length > 0 && (
        <section className="side-card proposals-mine">
          <h2>{w.yours}</h2>
          <ul>
            {own.map(p => (
              <li key={p.id} id={"proposal-" + p.id}>
                <span className="proposal-title">{p.title}</span>
                <span className="quiet-text">
                  {p.declinedAt === null ? w.waiting : p.declinedBy === member.id ? w.takenBack : p.reason ? format(w.declinedReason, { reason: p.reason }) : w.declined}
                  {" · "}<time dateTime={p.createdAt}>{d.ago(p.createdAt)}</time>
                </span>
                {p.declinedAt === null && <Island name="TakeBack" props={{ id: p.id, t: w }} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  ) };
}
