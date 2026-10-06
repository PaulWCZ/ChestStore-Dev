import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Alert } from "./icons.tsx";

// The incidents in progress that Status told Support about (lib/incidents-in.ts):
// one line each above the inbox and a ticket — what is broken, the
// services it touches, its public page — so agents answer "payment
// failed" with what they know. Gone once Status resolves it.
export type IncidentLine = { id: string; title: string; lang: string; services: string[]; url: string | null };

export function IncidentBanner({ incidents, t }: { incidents: IncidentLine[]; t: Catalogue["incident"] }) {
  if (incidents.length === 0) return null;
  return (
    <div className="incidents">
      {incidents.map(i => (
        <div key={i.id} className="notice danger incident">
          <Alert />
          <div className="stack tight">
            <strong>{format(t.banner, { title: "" })}<span lang={i.lang}>{i.title}</span></strong>
            {i.services.length > 0 && <span className="small">{format(t.services, { list: i.services.join(", ") })}</span>}
            {i.url && <a className="small" href={i.url} target="_blank" rel="noopener">{t.open}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
