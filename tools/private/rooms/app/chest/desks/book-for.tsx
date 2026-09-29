"use client";

import { useRouter } from "next/navigation";

// An admin books a desk for someone else: the page then shows the plan as
// that person would book it (their desk, their bookings), and they are told.
export function BookFor({ people, current, path, t }: { people: { id: string; name: string }[]; current: string; path: string; t: { label: string; me: string } }) {
  const router = useRouter();
  return (
    <label className="office-picker book-for">
      <span className="small muted">{t.label}</span>
      <select className="select" value={current} onChange={e => {
        const url = new URL(path, window.location.origin);
        if (e.target.value) url.searchParams.set("for", e.target.value);
        else url.searchParams.delete("for");
        router.push(url.pathname + url.search);
      }}>
        <option value="">{t.me}</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}
