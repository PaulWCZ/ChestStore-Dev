"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Check, Clock } from "../../../components/icons.tsx";
import { Picker } from "../../../components/picker.tsx";
import { ZoneSelect } from "../../../components/zone-select.tsx";
import { format, languageNames } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { ZoneGroup } from "../../../lib/zones.ts";
import { bookForGuest } from "../actions.ts";

type Words = { forGuest: Catalogue["forGuest"]; public: Catalogue["public"]; days: Catalogue["days"]; errors: Catalogue["errors"]; answers: Catalogue["answers"] };
type TypeChoice = { id: string; label: string; phone: boolean };

// Booking for a guest: the kind of meeting, a free time (the host's own
// hours, the notice aside), then who — the guest gets their confirmation
// and link as if they had booked themselves.
export function ForGuest({ types, typeId, hostZone, locale, zones, t }: { types: TypeChoice[]; typeId: string; hostZone: string; locale: string; zones: ZoneGroup[]; t: Words }) {
  const f = t.forGuest;
  const router = useRouter();
  const type = types.find(x => x.id === typeId) ?? types[0]!;
  return (
    <section className="card stack">
      <div>
        <label className="label" htmlFor="type">{f.type}</label>
        <select id="type" className="field wide-select" value={type.id} onChange={e => router.replace(`/chest/new?type=${e.target.value}`)}>
          {types.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      <Picker key={type.id} hostName="" hostZone={hostZone} first={null} locale={locale} zones={zones} t={t} source={`/chest/api/slots?type=${type.id}`}
        chosen={(start, when, zone, reset) => <Who key={start} typeId={type.id} phone={type.phone} start={start} when={when} zone={zone} locale={locale} zones={zones} t={t} onTaken={reset} />} />
    </section>
  );
}

function Who({ typeId, phone, start, when, zone: initialZone, locale, zones, t, onTaken }: { typeId: string; phone: boolean; start: string; when: string; zone: string; locale: string; zones: ZoneGroup[]; t: Words; onTaken: () => void }) {
  const f = t.forGuest;
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState(initialZone);
  const toast = useToast();
  const router = useRouter();
  return (
    <form className="stack guest-form" onSubmit={e => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      const name = String(d.get("name") ?? "");
      run(async () => {
        const r = await bookForGuest(typeId, { start, name, email: String(d.get("email") ?? ""), phone: String(d.get("phone") ?? ""), note: String(d.get("note") ?? ""), zone, language: String(d.get("language") ?? locale) });
        if (!r.ok) {
          if (r.error === "taken") onTaken();
          return setError(format(t.errors[r.error], r.values ?? {}));
        }
        toast({ text: format(r.value.delivery === "email" ? f.done : f.donePage, { name }), sent: true });
        router.push(`/chest/bookings/${r.value.id}`);
      });
    }}>
      <p style={{ margin: 0 }}><span className="tag free" style={{ fontSize: "var(--text-m)", padding: "6px 14px" }}><Clock />{when}</span></p>
      <div><label className="label" htmlFor="g-name">{f.name}</label><input id="g-name" name="name" className="field" maxLength={120} required autoFocus autoComplete="off" /></div>
      <div><label className="label" htmlFor="g-email">{f.email}</label><input id="g-email" name="email" type="email" className="field" maxLength={254} required autoComplete="off" aria-describedby="g-email-hint" /><p id="g-email-hint" className="hint">{f.emailHint}</p></div>
      {phone && <div><label className="label" htmlFor="g-phone">{f.phone}</label><input id="g-phone" name="phone" type="tel" className="field" maxLength={40} autoComplete="off" /></div>}
      <div><label className="label" htmlFor="g-note">{f.note}</label><textarea id="g-note" name="note" className="field" rows={2} maxLength={2000} /></div>
      <div className="grid-2">
        <div>
          <label className="label" htmlFor="g-language">{f.language}</label>
          <select id="g-language" name="language" className="field" defaultValue={locale}>
            {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="g-zone">{f.zone}</label><ZoneSelect id="g-zone" value={zone} groups={zones} onChange={setZone} /></div>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div><button type="submit" className="button" disabled={pending}><Check />{f.confirm}</button></div>
    </form>
  );
}
