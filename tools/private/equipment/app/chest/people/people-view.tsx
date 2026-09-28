"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Search } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { fold } from "../../../lib/model.ts";

export type Entry = { id: string; name: string; photo: string | null; text: string; count: number };

// The people, found as one types.
export function PeopleView({ leavers, members, t }: { leavers: Entry[]; members: Entry[]; t: Catalogue["peopleList"] }) {
  const [q, setQ] = useState("");
  const match = useMemo(() => {
    const k = fold(q);
    return (e: Entry) => !k || fold(e.name).split(" ").some(w => w.startsWith(k)) || fold(e.name).startsWith(k);
  }, [q]);
  const card = (e: Entry, gone: boolean) => (
    <li key={e.id}>
      <Link className={gone ? "person-card gone" : e.count === 0 ? "person-card idle" : "person-card"} href={`/chest/people/${e.id}`}>
        <Avatar name={e.name} photo={e.photo} size={40} />
        <span className="person-text"><span className="strong">{e.name}</span><span className="small muted">{e.text}</span></span>
        {e.count > 0 && <span className="count-chip" aria-hidden="true">{e.count}</span>}
      </Link>
    </li>
  );
  const shownLeavers = leavers.filter(match);
  const shownMembers = members.filter(match);
  return (
    <div className="stack">
      <div className="search-field narrow-field">
        <Search />
        <label className="visually-hidden" htmlFor="people-q">{t.find}</label>
        <input id="people-q" className="field" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.find} autoComplete="off" />
      </div>
      {shownLeavers.length > 0 && (
        <section aria-labelledby="leavers">
          <h2 id="leavers" className="section-title warn-title">{t.leavers}</h2>
          <ul className="people-grid">{shownLeavers.map(e => card(e, true))}</ul>
        </section>
      )}
      <section aria-labelledby="team">
        <h2 id="team" className="section-title">{t.team}</h2>
        {shownMembers.length === 0 ? <p className="muted">{t.empty}</p> : <ul className="people-grid">{shownMembers.map(e => card(e, false))}</ul>}
      </section>
    </div>
  );
}
