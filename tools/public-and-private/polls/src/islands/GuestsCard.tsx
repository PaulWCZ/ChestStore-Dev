import { Confirm, Switch } from "@argentic/chest-ui/components";
import { useState } from "react";
import { call, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";
import { fill as format, plural, type Plural } from "./words.ts";

// Guests outside the Chest (lib/guests.ts), for those who manage a named
// date poll: "Anyone with the link can answer" (takes effect at once: the
// kit's Switch), the link to copy, and who answered from outside — a
// guest's answer removed after the kit's Confirm (their name and email go
// for good: there is nothing to undo it with).
type Words = { guests: Catalogue["guests"] };

export function GuestsCard({ pollId, url, open, list, locale, t }: {
  pollId: string;
  url: string | null;
  open: boolean;
  list: { id: string; name: string; email: string | null }[];
  locale: string;
  t: Words;
}) {
  const [link, setLink] = useState(url);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  async function change(on: boolean) {
    setBusy(true);
    const result = await call("setGuests", { pollId, on });
    setBusy(false);
    if (!result.ok) return;
    setLink(result.value.link);
    toast({ id: `guests-${pollId}`, text: on ? t.guests.on : t.guests.off });
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ id: `copied-${pollId}`, text: t.guests.copied });
    } catch {
      (document.getElementById("guest-url") as HTMLInputElement | null)?.select();
    }
  }
  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    const result = await call("removeGuest", { pollId, participantId: removing.id });
    setBusy(false);
    setRemoving(null);
    if (result.ok) toast({ text: t.guests.removed });
  }

  return (
    <section className="card guests-card" aria-labelledby="guests">
      <h2 id="guests">{t.guests.title}</h2>
      {(open || link) && <Switch label={<strong>{t.guests.switch}</strong>} hint={t.guests.switchHint} checked={link !== null} disabled={busy || (!open && link === null)} onChange={next => void change(next)} />}
      {link && (
        <div className="guest-link">
          <label className="label" htmlFor="guest-url">{t.guests.link}</label>
          <input id="guest-url" className="field" readOnly value={link} onFocus={e => e.currentTarget.select()} />
          <div className="row"><button type="button" className="button small" onClick={() => void copy()}>{t.guests.copy}</button></div>
        </div>
      )}
      {list.length > 0 && (
        <>
          <p className="label">{plural(t.guests.count as Plural, list.length, locale)}</p>
          <ul className="guest-list">
            {list.map(g => (
              <li key={g.id}>
                <span className="who"><span>{g.name}</span>{g.email && <small>{g.email}</small>}</span>
                <button type="button" className="button link danger" disabled={busy} onClick={() => setRemoving({ id: g.id, name: g.name })} aria-label={format(t.guests.removeOne, { name: g.name })}>{t.guests.remove}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Confirm
        open={removing !== null}
        title={format(t.guests.removeTitle, { name: removing?.name ?? "" })}
        body={t.guests.removeBody}
        confirmLabel={t.guests.remove}
        cancelLabel={t.guests.keep}
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
