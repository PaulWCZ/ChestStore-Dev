import { DateRangeField } from "@argentic/chest-ui/components";
import type { DateRange, DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";

// The period to download: the kit's range of days, typed or chosen in the
// member's language (never the browser's date field); the last day is
// never before the first, and the form sends both ends as ISO dates
// (hidden fields named from and to).
export function Period({ first, today, label, labels, lang }: { first: string; today: string; label: string; labels: DateWords; lang: string }) {
  const [range, setRange] = useState<DateRange>({ from: first, to: today });
  return <DateRangeField label={label} value={range} onChange={setRange} today={today} names={{ from: "from", to: "to" }} required labels={labels} lang={lang} />;
}
