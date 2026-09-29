"use client";

import { DateField } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";

// The period to download: two days typed or chosen in the member's
// language (the kit's DateField, never the browser's date field); the form
// sends them as ISO dates (hidden fields named from and to).
export function Period({ first, today, t, labels }: { first: string; today: string; t: { from: string; to: string }; labels: DateWords }) {
  const [from, setFrom] = useState<string | null>(first);
  const [to, setTo] = useState<string | null>(today);
  return (
    <div className="form-grid">
      <div className="span-2">
        <DateField label={t.from} name="from" value={from} onChange={setFrom} today={today} max={to} required labels={labels} chips={false} />
      </div>
      <div className="span-2">
        <DateField label={t.to} name="to" value={to} onChange={setTo} today={today} min={from} required labels={labels} />
      </div>
    </div>
  );
}
