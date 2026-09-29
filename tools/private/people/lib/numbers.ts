// Safe in the browser: no SDK here.
// HR's numbers, from the employee records and the directory: how many
// people, by team, office and contract; arrivals and departures month by
// month; and the turnover of the last twelve months, as French HR usually
// computes it ("taux de rotation"): the average of arrivals and departures
// over the period, divided by the headcount on its first day.
import type { Contract } from "./model.ts";

// One population for every figure: the people working here — each HR
// record (interns and seconded staff included; someone without the Chest
// too), and each directory member without a record (contract null: "no
// record"). A record of someone who left the Chest without a last day
// written is `gone`: not counted today (HR is asked to write the day).
export type Worker = { team: string; office: string; contract: Contract | null; startDate: string | null; endDate: string | null; gone?: boolean };

export type Count = { label: string; count: number };
export type Month = { month: string; arrivals: number; departures: number };
export type Numbers = {
  headcount: number;
  byTeam: Count[];
  byOffice: Count[];
  byContract: { contract: Contract | null; count: number }[];
  months: Month[];
  turnover: number | null;
  // Whether HR records exist (departures are known only from them).
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

// Here on a day: started (someone whose first day nobody wrote counts as
// here today, never as here a year ago) and not gone.
const here = (w: Worker, day: string, today: boolean) =>
  !(today && w.gone) && (w.startDate === null ? today : w.startDate <= day) && (w.endDate === null || w.endDate >= day);

export function numbers(workers: readonly Worker[], now: string): Numbers {
  const months = lastMonths(now);
  const first = months[0]! + "-01";
  const fromRecords = workers.some(w => w.contract !== null);
  const rows: Month[] = months.map(month => ({
    month,
    arrivals: workers.filter(w => w.startDate?.startsWith(month) && w.startDate <= now).length,
    departures: workers.filter(w => w.endDate?.startsWith(month) && w.endDate <= now).length,
  }));
  const atStart = workers.filter(w => here(w, first, false)).length;
  const arrivals = workers.filter(w => w.startDate !== null && w.startDate >= first && w.startDate <= now).length;
  const departures = workers.filter(w => w.endDate !== null && w.endDate >= first && w.endDate <= now).length;
  const turnover = atStart > 0 ? Math.round(((arrivals + departures) / 2 / atStart) * 1000) / 10 : null;
  const current = workers.filter(w => here(w, now, true));
  const contracts = new Map<Contract | null, number>();
  for (const w of current) contracts.set(w.contract, (contracts.get(w.contract) ?? 0) + 1);
  return {
    headcount: current.length,
    byTeam: tally(current.map(w => w.team)),
    byOffice: tally(current.map(w => w.office)),
    byContract: [...contracts].map(([contract, count]) => ({ contract, count })).sort((a, b) => b.count - a.count),
    months: rows,
    turnover,
    fromRecords,
  };
}

// The workers of the Numbers page: every record, with the team and office
// of its member's profile, and every directory member without a record.
export function workersOf(
  records: readonly { memberId: string | null; contract: Contract; startDate: string | null; endDate: string | null }[],
  directory: readonly { id: string; team: string; office: string; startDate: string | null }[],
): Worker[] {
  const byId = new Map(directory.map(e => [e.id, e]));
  const linked = new Set(records.flatMap(r => (r.memberId ? [r.memberId] : [])));
  return [
    ...records.map(r => {
      const m = r.memberId ? byId.get(r.memberId) : undefined;
      return { team: m?.team ?? "", office: m?.office ?? "", contract: r.contract, startDate: r.startDate, endDate: r.endDate, gone: r.memberId !== null && !m && r.endDate === null };
    }),
    ...directory.filter(e => !linked.has(e.id)).map(e => ({ team: e.team, office: e.office, contract: null, startDate: e.startDate, endDate: null })),
  ];
}
