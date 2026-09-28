"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setMyOffice } from "../app/chest/actions.ts";
import { Pin } from "./icons.tsx";

// Which office a page shows, when the company has several: the choice is
// remembered as the member's own office.
export function OfficePicker({ offices, current, label, path }: { offices: { id: string; name: string }[]; current: string; label: string; path: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  if (offices.length < 2) return null;
  return (
    <label className="office-picker">
      <Pin />
      <span className="visually-hidden">{label}</span>
      <select className="select" value={current} onChange={e => {
        const id = e.target.value;
        start(async () => {
          await setMyOffice(id);
          const url = new URL(path, window.location.origin);
          url.searchParams.set("office", id);
          router.push(url.pathname + url.search);
        });
      }}>
        {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
