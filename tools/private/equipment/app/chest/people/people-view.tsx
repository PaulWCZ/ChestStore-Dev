"use client";

import { Avatar, SearchBox } from "@argentic/chest-ui/components";
import { matches } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";

export type Entry = { id: string; name: string; photo: string | null; text: string; count: number };

// The people, found as one types (the kit's rule: the start of any word
// of the name, accents aside, words in any order).
export function PeopleView({ leavers, members, t, search }: { leavers: Entry[]; members: Entry[]; t: Catalogue["peopleList"]; search: Catalogue["search"] }) {
  const [q, setQ] = useState("");
  const match = useMemo(() => (e: Entry) => !q.trim() || matches(e.name, q), [q]);
  const card = (e: Entry, gone: boolean) => (
    <li key={e.id}>
      <Link className={gone ? "person-card gone" : e.count === 0 ? "person-card idle" : "person-card"} href={`/chest/people/${e.id}`}>
        <Avatar name={e.name} photo={e.photo} size="l" />
        <span className="person-text"><span className="strong">{e.name}</span><span className="small muted">{e.text}</span></span>
        {e.count > 0 && <span className="count-chip" aria-hidden="true">{e.count}</span>}
      </Link>
    </li>
  );
  const shownLeavers = leavers.filter(match);
  const shownMembers = members.filter(match);
  return (
    <div className="stack">
      <div className="narrow-field">
        <SearchBox action="/chest/people" onSearch={setQ} shortcut={false} maxLength={100} labels={{ ...search, label: t.find, placeholder: t.find }} />
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
