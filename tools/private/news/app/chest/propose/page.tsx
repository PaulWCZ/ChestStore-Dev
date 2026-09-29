import { everyone } from "../../../lib/audience.ts";
import { dates } from "../../../lib/dates.ts";
import { db } from "../../../lib/db.ts";
import { format } from "../../../lib/i18n/index.ts";
import { mine } from "../../../lib/proposals.ts";
import { viewer } from "../../../lib/session.ts";
import { ProposeForm, TakeBack } from "./form.tsx";

// "Share something" (everyone): propose a shout-out or a piece of news; a
// publisher publishes it (lib/proposals.ts). Below, one's own proposals:
// waiting (take it back), or not published (with the reason, if given).
export default async function ProposePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const query = await searchParams;
  const sql = db();
  const [own, all] = await Promise.all([mine(sql, member), everyone()]);
  const colleagues = all.people.filter(p => p.id !== member.id).map(p => ({ id: p.id, name: p.name }));
  const d = dates(locale, zone);
  const w = t.propose;
  return (
    <div className="narrow propose">
      <h1>{w.title}</h1>
      <p className="lead">{w.lead}</p>
      <ProposeForm colleagues={colleagues} start={query["kind"] === "info" ? "info" : "shoutout"} locale={locale} t={{ propose: w, errors: t.errors, peoplePicker: t.peoplePicker }} />
      {own.length > 0 && (
        <section className="side-card proposals-mine">
          <h2>{w.yours}</h2>
          <ul>
            {own.map(p => (
              <li key={p.id}>
                <span className="proposal-title">{p.title}</span>
                <span className="quiet-text">
                  {p.declinedAt === null ? w.waiting : p.declinedBy === member.id ? w.takenBack : p.reason ? format(w.declinedReason, { reason: p.reason }) : w.declined}
                  {" · "}<time dateTime={p.createdAt}>{d.ago(p.createdAt)}</time>
                </span>
                {p.declinedAt === null && <TakeBack id={p.id} t={w} errors={t.errors} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
