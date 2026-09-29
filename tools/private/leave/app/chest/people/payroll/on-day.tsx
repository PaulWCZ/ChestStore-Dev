"use client";

import { DateField, MonthField } from "@argentic/chest-ui/components";
import { useState } from "react";
import type { Catalogue } from "../../../../lib/i18n/index.ts";

// The day of the balances file, in the kit's date field (typed in the
// reader's language, or chosen on a calendar); the form sends it as "on".
export function OnDay({ today, label, labels }: { today: string; label: string; labels: Catalogue["date"] }) {
  const [on, setOn] = useState<string | null>(today);
  return <DateField id="on" name="on" label={label} value={on} onChange={setOn} today={today} max={today} required labels={labels} />;
}

// The month of the absences file, in the kit's month field: the month in
// words in the reader's language, the previous and next one tap away; the
// form sends it as "month" ("2026-09").
export function OnMonth({ today, min, max, label, labels }: { today: string; min: string; max: string; label: string; labels: Catalogue["date"] }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  return <MonthField id="month" name="month" label={label} value={month} onChange={setMonth} today={today} min={min} max={max} labels={labels} />;
}
