import { call } from "@argentic/chest-app/client";
import { useEffect, useRef, useState } from "react";
import type { Row } from "../lib/view.ts";

// What a Give dialog offers (the stockOffer action): read when the dialog
// opens and again as the manager types (a short pause first), never sent
// with the page — a company with 1,000 things in stock made every visit of
// the overview carry them. The newest answer wins; while one is on its way
// the list keeps what it showed, its buttons disabled (a click would give
// a thing of the previous search).
export type Offer = Row & { categoryId: string };
export function useOffer(open: boolean, ask: { categoryId?: string | null; consumables: boolean; person?: string | null }): { rows: Offer[]; loading: boolean; q: string; setQ: (q: string) => void } {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const key = `${ask.categoryId ?? ""}|${ask.consumables}|${ask.person ?? ""}`;
  useEffect(() => {
    if (!open) {
      setQ("");
      setRows([]);
      return;
    }
    const ticket = ++latest.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const answer = await call("stockOffer", {
        q, consumables: ask.consumables,
        ...(ask.categoryId ? { categoryId: ask.categoryId } : {}),
        ...(ask.person ? { person: ask.person } : {}),
      }, { quiet: true, refresh: false });
      if (ticket !== latest.current) return;
      setLoading(false);
      if (answer.ok) setRows(answer.value as Offer[]);
    }, q ? 200 : 0);
    return () => clearTimeout(timer);
  }, [open, q, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, loading, q, setQ };
}
