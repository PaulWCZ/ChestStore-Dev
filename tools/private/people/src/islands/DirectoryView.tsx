import { Avatar, EmptyState, SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import { plural } from "@argentic/chest-app/client";
import { useEffect, useMemo, useState } from "react";
import { Close, Moon, Pin, Search, Wave } from "../components/icons.tsx";
import { Portrait } from "../components/portrait.tsx";
import { fold } from "../shared/model.ts";

// The wall of portraits, searched as one types (name, job, team, office,
// "ask me about"; accents and case aside; "/" goes to the box — the kit's
// SearchBox) and filtered by team and office. Every person is on the page
// already: nothing waits for the server. The search stays in the address,
// so "back" finds it again. Team and office stay two compact selects, not
// the kit's filter chips: a company has many teams and offices, chips
// would push the portraits below the fold on a phone, and chips are links
// that reload the page where this wall filters as one types. Every word
// and date is written on the server; the welcome (newcomers, HR's first
// steps, one's own empty profile) shows while nothing is filtered.
export type Card = { id: string; name: string; photo: string | null; title: string; team: string; office: string; skills: string[]; isNew: boolean; me: boolean;
  // "Away · back on Mon 12 Oct", written on the server (Leave told People).
  away: string | null;
  // More words the search finds (work address, extra fields).
  also: string;
  // Staff without the Chest: marked, and their card opens nothing (HR's
  // opens their record).
  offline: boolean;
  href: string | null;
};

export type Welcome = {
  // "New colleagues": "Say hello to Nora", their job and team, "Started 6 days ago".
  hello: { title: string; people: { id: string; name: string; photo: string | null; team: string; text: string; line: string; started: string }[] } | null;
  // HR's first run: three steps, each ticked when done.
  setup: { title: string; body: string; done: string; steps: { key: string; href: string; label: string; done: boolean }[] } | null;
  // One's own profile still empty.
  nudge: { name: string; photo: string | null; title: string; body: string; action: string; href: string } | null;
};

type Words = {
  team: string; allTeams: string; office: string; allOffices: string; clear: string;
  shown: { zero?: string; one: string; other: string }; noResults: { title: string; body: string }; askMe: string; new: string; offline: string;
  you: string;
  search: SearchWords;
};

export function DirectoryView({ cards, teams, offices, locale, initial, welcome, t }: { cards: Card[]; teams: string[]; offices: string[]; locale: string; initial: { q: string; team: string; office: string }; welcome: Welcome; t: Words }) {
  const [q, setQ] = useState(initial.q);
  // The kit's box keeps what is typed; "Clear" gives a fresh one.
  const [fresh, setFresh] = useState(0);
  const [team, setTeam] = useState(initial.team);
  const [office, setOffice] = useState(initial.office);
  const haystacks = useMemo(() => new Map(cards.map(c => [c.id, fold([c.name, c.title, c.team, c.office, ...c.skills, c.also].join(" "))])), [cards]);
  const words = fold(q).split(" ").filter(Boolean);
  const shown = cards.filter(c => (!team || c.team === team) && (!office || c.office === office) && words.every(w => haystacks.get(c.id)?.includes(w)));
  const filtered = q !== "" || team !== "" || office !== "";

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of [["q", q], ["team", team], ["office", office]] as const) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [q, team, office]);

  const clear = () => {
    setQ("");
    setFresh(n => n + 1);
    setTeam("");
    setOffice("");
  };

  return (
    <>
      <div className="finder">
        <div className="find">
          <SearchBox key={fresh} action="/chest" value={q} onSearch={setQ} maxLength={100} labels={t.search} />
        </div>
        {teams.length > 1 && (
          <label className="filter">
            <span className="visually-hidden">{t.team}</span>
            <select className="select" value={team} onChange={e => setTeam(e.target.value)}>
              <option value="">{t.allTeams}</option>
              {teams.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {offices.length > 1 && (
          <label className="filter">
            <span className="visually-hidden">{t.office}</span>
            <select className="select" value={office} onChange={e => setOffice(e.target.value)}>
              <option value="">{t.allOffices}</option>
              {offices.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        )}
        {filtered && <button type="button" className="button quiet small" onClick={clear}><Close />{t.clear}</button>}
      </div>
      {!filtered && <WelcomeBlocks welcome={welcome} />}
      <p className="visually-hidden" role="status" aria-live="polite">{filtered ? plural(locale, t.shown, shown.length) : ""}</p>
      {shown.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t.noResults.title}
          body={t.noResults.body}
          action={<button type="button" className="button quiet" onClick={clear}>{t.clear}</button>}
        />
      ) : (
        <ul className="wall">
          {shown.map(c => {
            const inside = <>
                <Portrait name={c.name} photo={c.photo} size={104} team={c.team} />
                {(c.isNew || c.me) && <span className={c.me ? "badge me" : "badge"}>{c.me ? t.you : t.new}</span>}
                {c.offline && <span className="badge offline">{t.offline}</span>}
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
                  <span className="topics" aria-label={t.askMe}>
                    {c.skills.slice(0, 3).map(s => <span key={s} className="topic">{s}</span>)}
                  </span>
                )}
            </>;
            return (
              <li key={c.id} id={`person-${c.id}`}>
                {c.href ? <a className="person" href={c.href}>{inside}</a> : <div className="person offline">{inside}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// The welcome above the wall: newcomers, HR's first steps, one's own nudge.
function WelcomeBlocks({ welcome: { hello, setup, nudge } }: { welcome: Welcome }) {
  return (
    <>
      {hello && (
        <section className="hello" aria-labelledby="hello-title">
          <h2 id="hello-title" className="eyebrow"><Wave />{hello.title}</h2>
          <ul className="hello-list">
            {hello.people.map(e => (
              <li key={e.id}>
                <a href={`/chest/people/${e.id}`} className="hello-card">
                  <Portrait name={e.name} photo={e.photo} size={112} team={e.team} />
                  <span className="hello-text">
                    <strong>{e.text}</strong>
                    <span>{e.line}</span>
                    <span className="muted">{e.started}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {setup && (
        <section className="nudge setup" aria-labelledby="setup-title">
          <div>
            <h2 id="setup-title">{setup.title}</h2>
            <p className="muted">{setup.body}</p>
            <ol className="setup-steps">
              {setup.steps.map(s => (
                <li key={s.key} className={s.done ? "done" : undefined}>
                  <span className="setup-tick" aria-hidden="true">{s.done ? "✓" : ""}</span>
                  <a href={s.href}>{s.label}</a>
                  {s.done && <span className="visually-hidden"> ({setup.done})</span>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      {nudge && !setup && (
        <div className="nudge">
          <Avatar name={nudge.name} photo={nudge.photo} size="xl" />
          <div>
            <h2>{nudge.title}</h2>
            <p className="muted">{nudge.body}</p>
          </div>
          <a className="button" href={nudge.href}>{nudge.action}</a>
        </div>
      )}
    </>
  );
}
