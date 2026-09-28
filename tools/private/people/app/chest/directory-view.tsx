"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Close, Moon, Pin, Search } from "../../components/icons.tsx";
import { Portrait } from "../../components/portrait.tsx";
import { plural } from "../../lib/i18n/format.ts";
import { fold } from "../../lib/model.ts";

// The wall of portraits, searched as one types (name, job, team, office,
// "ask me about"; accents and case aside) and filtered by team and office.
// Every person is on the page already: nothing waits for the server. The
// search stays in the address, so "back" finds it again.
export type Card = { id: string; name: string; photo: string | null; title: string; team: string; office: string; skills: string[]; isNew: boolean; me: boolean;
  // "Away · back on Mon 12 Oct", written on the server (Leave told People).
  away: string | null;
};

type Words = {
  directory: {
    search: string; searchPlaceholder: string; team: string; allTeams: string; office: string; allOffices: string; clear: string;
    shown: { zero?: string; one: string; other: string }; noResults: { title: string; body: string }; askMe: string; new: string;
  };
  you: string;
};

export function DirectoryView({ cards, locale, initial, welcome, t }: { cards: Card[]; locale: string; initial: { q: string; team: string; office: string }; welcome?: ReactNode; t: Words }) {
  const [q, setQ] = useState(initial.q);
  const [team, setTeam] = useState(initial.team);
  const [office, setOffice] = useState(initial.office);
  const sorter = useMemo(() => new Intl.Collator(locale, { sensitivity: "base" }), [locale]);
  const teams = useMemo(() => [...new Set(cards.map(c => c.team).filter(Boolean))].sort(sorter.compare), [cards, sorter]);
  const offices = useMemo(() => [...new Set(cards.map(c => c.office).filter(Boolean))].sort(sorter.compare), [cards, sorter]);
  const haystacks = useMemo(() => new Map(cards.map(c => [c.id, fold([c.name, c.title, c.team, c.office, ...c.skills].join(" "))])), [cards]);
  const words = fold(q).split(" ").filter(Boolean);
  const shown = cards.filter(c => (!team || c.team === team) && (!office || c.office === office) && words.every(w => haystacks.get(c.id)!.includes(w)));
  const filtered = q !== "" || team !== "" || office !== "";

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of [["q", q], ["team", team], ["office", office]] as const) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [q, team, office]);

  const clear = () => {
    setQ("");
    setTeam("");
    setOffice("");
  };

  return (
    <>
      <div className="finder" role="search">
        <label className="find">
          <Search />
          <span className="visually-hidden">{t.directory.search}</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.directory.searchPlaceholder} maxLength={100} autoComplete="off" enterKeyHint="search" />
        </label>
        {teams.length > 1 && (
          <label className="filter">
            <span className="visually-hidden">{t.directory.team}</span>
            <select className="select" value={team} onChange={e => setTeam(e.target.value)}>
              <option value="">{t.directory.allTeams}</option>
              {teams.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {offices.length > 1 && (
          <label className="filter">
            <span className="visually-hidden">{t.directory.office}</span>
            <select className="select" value={office} onChange={e => setOffice(e.target.value)}>
              <option value="">{t.directory.allOffices}</option>
              {offices.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {filtered && <button type="button" className="button quiet small" onClick={clear}><Close />{t.directory.clear}</button>}
      </div>
      {!filtered && welcome}
      <p className="visually-hidden" role="status" aria-live="polite">{filtered ? plural(t.directory.shown, shown.length, locale) : ""}</p>
      {shown.length === 0 ? (
        <div className="empty">
          <Search />
          <h2>{t.directory.noResults.title}</h2>
          <p>{t.directory.noResults.body}</p>
          <button type="button" className="button quiet" onClick={clear}>{t.directory.clear}</button>
        </div>
      ) : (
        <ul className="wall">
          {shown.map(c => (
            <li key={c.id}>
              <Link className="person" href={`/chest/people/${c.id}`}>
                <Portrait name={c.name} photo={c.photo} size={104} team={c.team} arch />
                {(c.isNew || c.me) && <span className={c.me ? "badge me" : "badge"}>{c.me ? t.you : t.directory.new}</span>}
                <span className="person-name">{c.name}</span>
                {c.title && <span className="person-title">{c.title}</span>}
                {(c.team || c.office) && (
                  <span className="person-where">
                    {c.team && <span className="team">{c.team}</span>}
                    {c.office && <span className="office"><Pin />{c.office}</span>}
                  </span>
                )}
                {c.away && <span className="away"><Moon />{c.away}</span>}
                {c.skills.length > 0 && (
                  <span className="topics" aria-label={t.directory.askMe}>
                    {c.skills.slice(0, 3).map(s => <span key={s} className="topic">{s}</span>)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
