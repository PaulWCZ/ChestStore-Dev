"use client";

import { usePathname, useRouter } from "next/navigation";

// Which cycle a page shows: a select that goes there at once (and a
// button for whoever browses without scripts).
export function CyclePicker({ cycles, value, t }: { cycles: { id: string; name: string; closed: boolean; current: boolean }[]; value: string; t: { label: string; show: string; closed: string; current: string } }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <form method="get" action={path} onSubmit={e => e.preventDefault()}>
      <label className="visually-hidden" htmlFor="cycle">{t.label}</label>
      <select id="cycle" name="cycle" className="select" value={value} onChange={e => router.push(`${path}?cycle=${e.target.value}`)}>
        {cycles.map(c => <option key={c.id} value={c.id}>{c.name}{c.current ? ` · ${t.current}` : c.closed ? ` · ${t.closed}` : ""}</option>)}
      </select>
      <noscript><button type="submit" className="button quiet small">{t.show}</button></noscript>
    </form>
  );
}
