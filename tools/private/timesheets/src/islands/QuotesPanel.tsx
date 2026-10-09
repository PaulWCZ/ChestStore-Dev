import { call, toast } from "@argentic/chest-app/client";
import { useStep } from "../components/step.ts";
import { StatusBadge } from "@argentic/chest-ui/components";
import { Send } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../i18n/format.ts";

// Billable time to the Quotes tool: one draft invoice per project of the
// period shown (lib/handoff.ts), and the hand-offs made lately — waiting
// for their invoice (taken back while so), invoiced, or taken back.
export type SendableRow = { projectId: string; name: string; client: string; color: string; hours: string; amount: string | null; entries: number };
export type HandoffRow = { id: string; title: string; sub: string; state: "waiting" | "invoiced" | "cancelled"; invoice: string | null; link: string | null };
type Words = { reports: Catalogue["reports"]; errors: Catalogue["errors"] };

// linked: a tool receives the hand-off now; else the panel says why
// nothing can be sent (the hand-offs made are still listed).
export function QuotesPanel({ rows, handoffs, from, to, linked, locale, t }: { rows: SendableRow[]; handoffs: HandoffRow[]; from: string; to: string; linked: boolean; locale: string; t: Words }) {
  const [pending, start] = useStep();
  const w = t.reports.quotes;
  function send(r: SendableRow) {
    start(async () => {
      const done = await call("sendToQuotes", { projectId: r.projectId, from, to });
      if (!done.ok) return;
      // Quotes was told: no Undo here; "Take back" below does it.
      toast({ id: `quotes-${r.projectId}`, text: plural(w.sent, done.value.entries, locale, { project: r.name }), sent: true });
    });
  }
  function takeBack(id: string) {
    start(async () => {
      const done = await call("takeBackFromQuotes", { id });
      if (!done.ok) return;
      toast({ id: `quotes-back-${id}`, text: w.takenBack, sent: true });
    });
  }
  return (
    <section className="panel quotes" aria-labelledby="quotes-title">
      <h2 id="quotes-title"><Send />{w.title}</h2>
      <p className="small muted">{w.intro}</p>
      {!linked ? <p className="notice small">{w.notLinked}</p> : rows.length === 0 ? <p className="muted">{w.nothing}</p> : (
        <ul className="quotes-list">
          {rows.map(r => (
            <li key={r.projectId}>
              <span className={`swatch c-${r.color}`} aria-hidden="true" />
              <span className="quotes-what"><strong>{r.name}</strong><span className="small muted">{[r.client, plural(w.entries, r.entries, locale)].join(" · ")}</span></span>
              <span className="num">{r.hours}{r.amount ? <span className="small muted block">{r.amount}</span> : null}</span>
              <button type="button" className="button quiet" disabled={pending} onClick={() => send(r)} aria-label={format(w.sendLabel, { project: r.name })}><Send />{w.send}</button>
            </li>
          ))}
        </ul>
      )}
      {handoffs.length > 0 && (
        <>
          <h3 className="label">{w.recent}</h3>
          <ul className="quotes-list" id="quotes-recent">
            {handoffs.map(h => (
              <li key={h.id}>
                <span className="quotes-what"><strong>{h.title}</strong><span className="small muted">{h.sub}</span></span>
                <StatusBadge tone={h.state === "invoiced" ? "ok" : h.state === "waiting" ? "wait" : "neutral"} size="s" label={h.state === "invoiced" ? (h.invoice ? format(w.invoicedAs, { invoice: h.invoice }) : w.invoiced) : h.state === "waiting" ? w.waiting : w.cancelled} />
                {h.link && <a className="button link" href={h.link}>{w.open}</a>}
                {h.state === "waiting" && <button type="button" className="button link" disabled={pending} onClick={() => takeBack(h.id)} aria-label={format(w.takeBackLabel, { what: h.title })}>{w.takeBack}</button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
