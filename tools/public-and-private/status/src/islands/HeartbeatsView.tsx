import { toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Trash } from "../components/icons.tsx";
import { useRun } from "../components/use-run.ts";
import type { ErrorCode } from "../lib/app-error.ts";
import { format } from "../components/format.ts";

// Heartbeats: choose a service and how often its job runs, get a secret
// address (shown once), paste it at the end of the job. The list says when
// each one last called, or since when it is silent. Deleting one cannot be
// undone (its secret address dies with it): the kit's Confirm asks first.
export type HeartbeatRow = { componentId: string; name: string; every: number; everyLabel: string; standing: string; silent: boolean };
type Words = { heartbeats: Record<string, string>; errors: Record<ErrorCode, string> };

export function HeartbeatsView({ rows, services, every, t }: { rows: HeartbeatRow[]; services: { id: string; name: string }[]; every: { value: number; label: string }[]; t: Words }) {
  const w = t.heartbeats;
  const { run, pending } = useRun();
  const [service, setService] = useState(services[0]?.id ?? "");
  const [minutes, setMinutes] = useState(1440);
  const [made, setMade] = useState<{ name: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState<HeartbeatRow | null>(null);
  const make = async (componentId: string, value: number) => {
    const name = services.find(s => s.id === componentId)?.name ?? "";
    await run("createHeartbeat", { componentId, every: value }, result => { setMade({ name, url: result.url }); toast(w.created!); });
  };
  return (
    <section className="card pad stack" aria-labelledby="heartbeats-title">
      <h2 id="heartbeats-title">{w.title}</h2>
      <p className="hint">{w.intro}</p>
      {made && (
        <div className="note stack" role="status">
          <strong>{w.created}</strong>
          <label className="label" htmlFor="heartbeat-url">{format(w.address!, { component: made.name })}</label>
          <input id="heartbeat-url" className="field mono" readOnly value={made.url} onFocus={e => e.target.select()} autoFocus />
          <span>{w.example}</span>
          <code className="copy">curl -fsS {made.url}</code>
        </div>
      )}
      {rows.length === 0 ? <p className="muted">{w.none}</p> : (
        <ul className="plain-list">
          {rows.map(r => (
            <li key={r.componentId} id={`heartbeat-${r.componentId}`} className="plain-row">
              <span>
                <strong>{r.name}</strong> <span className="muted">· {r.everyLabel}</span><br />
                <span className={r.silent ? "error" : "muted"}>{r.standing}</span>
              </span>
              <span className="line-actions">
                <button type="button" className="button quiet small" disabled={pending} onClick={() => void make(r.componentId, r.every)}>{w.renew}</button>
                <button type="button" className="icon-button" disabled={pending} aria-label={format(w.remove!, { component: r.name })} onClick={() => setDeleting(r)}><Trash /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {services.length > 0 && (
        <form className="check-fields" onSubmit={e => { e.preventDefault(); void make(service, minutes); }}>
          <div>
            <label className="label small-label" htmlFor="heartbeat-service">{w.service}</label>
            <select id="heartbeat-service" className="field" value={service} onChange={e => setService(e.target.value)}>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label small-label" htmlFor="heartbeat-every">{w.every}</label>
            <select id="heartbeat-every" className="field" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {every.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="end-field"><button type="submit" className="button quiet" disabled={pending}>{w.create}</button></div>
        </form>
      )}
      <p className="hint">{w.delay}</p>
      <Confirm
        open={deleting !== null}
        title={format(w.deleteTitle!, { component: deleting?.name ?? "" })}
        body={w.deleteBody!}
        confirmLabel={w.delete!}
        cancelLabel={w.cancel!}
        busy={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const r = deleting; if (r) void run("removeHeartbeat", { componentId: r.componentId }, w.removed).then(() => setDeleting(null)); }}
      />
    </section>
  );
}
