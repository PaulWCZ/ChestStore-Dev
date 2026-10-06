import { navigate } from "@argentic/chest-app/client";
import { DateField, DayStrip } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { StayLink } from "./stay-link.tsx";

export type DayPickerProps = {
  days: string[];
  current: string;
  today: string;
  path: string;
  keep: Record<string, string>;
  // The field of "Another day…".
  label: string;
  labels: DateWords;
};

// The days one can pick soon, as big tiles (the kit's DayStrip: it scrolls
// sideways on a phone, never the page), and "Another day…": a date typed
// or chosen on a calendar, in the member's language (the kit's DateField,
// never the browser's own date field). Each day is the page's address with
// ?day=, and the other parameters kept; it opens in place.
export function DayPicker({ days, current, today, path, keep, label, labels }: DayPickerProps) {
  const href = (day: string) => `${path}?${new URLSearchParams({ day, ...keep }).toString()}`;
  return (
    <DayStrip days={days} current={current} today={today} href={href} labels={labels} link={props => <StayLink {...props} />}>
      <details className="other-day">
        <summary className="button quiet small">{labels.otherDay}</summary>
        <div className="other-day-form">
          <DateField label={label} value={current} today={today} labels={labels} chips={false}
            onChange={day => { if (day) void navigate(href(day), { top: false }); }} />
        </div>
      </details>
    </DayStrip>
  );
}
