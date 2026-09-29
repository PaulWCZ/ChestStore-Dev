"use client";

import { DateField } from "@argentic/chest-ui/components";
import { useState } from "react";
import type { Catalogue } from "../../../../lib/i18n/index.ts";

// The day of the balances file, in the kit's date field (typed in the
// reader's language, or chosen on a calendar); the form sends it as "on".
export function OnDay({ today, label, labels }: { today: string; label: string; labels: Catalogue["date"] }) {
  const [on, setOn] = useState<string | null>(today);
  return <DateField id="on" name="on" label={label} value={on} onChange={setOn} today={today} max={today} required labels={labels} />;
}
