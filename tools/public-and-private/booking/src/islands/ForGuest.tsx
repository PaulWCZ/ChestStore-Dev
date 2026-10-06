import { useState } from "react";
import { Alert, Check } from "../components/icons.tsx";
import { Picker, When, type PickerWords } from "../components/picker.tsx";
import { ZoneSelect } from "../components/zone-select.tsx";
import { call, navigate, toast } from "../core/client.tsx";
import { format, languageNames } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { ZoneGroup } from "../lib/zones.ts";

type Words = PickerWords & { forGuest: Catalogue["forGuest"] };
type TypeChoice = { id: string; label: string; phone: boolean };

// Booking for a guest: the kind of meeting, a free time (the host's own
// hours, the notice aside), then who — the guest gets their confirmation
// and link as if they had booked themselves.
export function ForGuest({ mailing, types, typeId, hostZone, locale, zones, t }: { mailing: boolean; types: TypeChoice[]; typeId: string; hostZone: string; locale: string; zones: ZoneGroup[]; t: Words }) {
  const f = t.forGuest;
  const type = types.find(x => x.id === typeId) ?? types[0]!;
  return (
    <section className="card stack">
      <div>
        <label className="label" htmlFor="type">{f.type}</label>
        <select id="type" className="field wide-select" value={type.id} onChange={e => void navigate(`/chest/new?type=${e.target.value}`, { replace: true })}>
          {types.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      <Picker key={type.id} hostName="" hostZone={hostZone} first={null} locale={locale} zones={zones} t={t} source={`/chest/api/slots?type=${type.id}`}
        chosen={(start, when, zone, reset) => <Who key={start} mailing={mailing} typeId={type.id} phone={type.phone} start={start} when={when} zone={zone} locale={locale} zones={zones} t={t} onTaken={reset} />} />
    </section>
  );
}

function Who({ mailing, typeId, phone, start, when, zone: initialZone, locale, zones, t, onTaken }: { mailing: boolean; typeId: string; phone: boolean; start: string; when: string; zone: string; locale: string; zones: ZoneGroup[]; t: Words; onTaken: () => void }) {
  const f = t.forGuest;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState(initialZone);
  return (
    <form className="stack guest-form" onSubmit={async e => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      const name = String(d.get("name") ?? "");
      setPending(true);
      const r = await call("bookForGuest", { typeId, start, name, email: String(d.get("email") ?? ""), phone: String(d.get("phone") ?? ""), note: String(d.get("note") ?? ""), zone, language: String(d.get("language") ?? locale) }, { quiet: true, refresh: false });
      setPending(false);
      if (!r.ok) {
        if (r.error === "taken") onTaken();
        return setError(r.message);
      }
      toast({ text: format(r.value.delivery === "email" ? f.done : f.donePage, { name }), sent: true });
      await navigate(`/chest/bookings/${r.value.id}`);
    }}>
      <p className="chosen"><When when={when} /></p>
      <div><label className="label" htmlFor="g-name">{f.name}</label><input id="g-name" name="name" className="field" maxLength={120} required autoFocus autoComplete="off" /></div>
      <div><label className="label" htmlFor="g-email">{f.email}</label><input id="g-email" name="email" type="email" className="field" maxLength={254} required autoComplete="off" aria-describedby="g-email-hint" /><p id="g-email-hint" className="hint">{mailing ? f.emailHint : f.emailHintNoMail}</p></div>
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
