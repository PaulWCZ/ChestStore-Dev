// Safe in the browser: no SDK here.
// HR's numbers, from the directory and the employee records: how many
// people, by team, office and contract; arrivals and departures month by
// month; and the turnover of the last twelve months, as French HR usually
// computes it ("taux de rotation"): the average of arrivals and departures
// over the period, divided by the headcount on its first day.
import type { Contract } from "./model.ts";

type Person = { team: string; office: string };
type Employment = { contract: Contract; startDate: string | null; endDate: string | null };

export type Count = { label: string; count: number };
export type Month = { month: string; arrivals: number; departures: number };
export type Numbers = {
  headcount: number;
  byTeam: Count[];
  byOffice: Count[];
  byContract: { contract: Contract; count: number }[];
  months: Month[];
  turnover: number | null;
  // Whether the months come from the records (arrivals and departures), or
  // only from the profiles' start dates (no records yet: arrivals only).
  fromRecords: boolean;
};

function tally(values: string[]): Count[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// The twelve months ending with this one, oldest first ("2025-10" … "2026-09").
export function lastMonths(now: string, n = 12): string[] {
  const y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const k = y * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
  });
}

const here = (e: Employment, day: string) => e.startDate !== null && e.startDate <= day && (e.endDate === null || e.endDate >= day);

export function numbers(people: readonly Person[], records: readonly Employment[], starts: readonly (string | null)[], now: string): Numbers {
  const months = lastMonths(now);
  const first = months[0]! + "-01";
  const fromRecords = records.some(r => r.startDate !== null);
  const rows: Month[] = months.map(month => ({
    month,
    arrivals: fromRecords ? records.filter(r => r.startDate?.startsWith(month)).length : starts.filter(s => s?.startsWith(month)).length,
    departures: fromRecords ? records.filter(r => r.endDate?.startsWith(month)).length : 0,
  }));
  let turnover: number | null = null;
  if (fromRecords) {
    const atStart = records.filter(r => here(r, first)).length;
    const arrivals = records.filter(r => r.startDate !== null && r.startDate >= first && r.startDate <= now).length;
    const departures = records.filter(r => r.endDate !== null && r.endDate >= first && r.endDate <= now).length;
    if (atStart > 0) turnover = Math.round(((arrivals + departures) / 2 / atStart) * 1000) / 10;
  }
  const current = records.filter(r => here(r, now));
  const contracts = new Map<Contract, number>();
  for (const r of current) contracts.set(r.contract, (contracts.get(r.contract) ?? 0) + 1);
  return {
    headcount: people.length,
    byTeam: tally(people.map(p => p.team)),
    byOffice: tally(people.map(p => p.office)),
    byContract: [...contracts].map(([contract, count]) => ({ contract, count })).sort((a, b) => b.count - a.count),
    months: rows,
    turnover,
    fromRecords,
  };
}
