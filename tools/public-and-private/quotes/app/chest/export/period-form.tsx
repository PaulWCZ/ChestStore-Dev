"use client";

import { DateField } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";

// Any period: two days typed in the member's language (the kit's
// DateField, never the browser's), sent in the address like the presets.
export function PeriodForm({ from, to, today, labels, words }: { from: string; to: string; today: string; labels: DateWords; words: { from: string; to: string; show: string } }) {
  const [start, setStart] = useState<string | null>(from);
  const [end, setEnd] = useState<string | null>(to);
  return (
    <form className="export-dates" action="/chest/export">
      <DateField id="from" name="from" label={words.from} value={start} onChange={setStart} today={today} max={end} required chips={false} labels={labels} />
      <DateField id="to" name="to" label={words.to} value={end} onChange={setEnd} today={today} min={start} required chips={false} labels={labels} />
      <button type="submit" className="button quiet export-go" disabled={!start || !end}>{words.show}</button>
    </form>
  );
}
