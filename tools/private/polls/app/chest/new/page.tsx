import { notFound } from "next/navigation";
import { groups } from "../../../lib/audience.ts";
import { dates } from "../../../lib/dates.ts";
import { db } from "../../../lib/db.ts";
import { isKind } from "../../../lib/model.ts";
import { mayCreate } from "../../../lib/polls.ts";
import { viewer } from "../../../lib/session.ts";
import { chestToday } from "../../../lib/zone.ts";
import { emptyValue, pulseValue } from "../../../lib/composer-value.ts";
import { Composer } from "../composer.tsx";

// A new poll, of the kind chosen on the home page (a question by default),
// or the team pulse (a weekly anonymous survey, ready to send).
export default async function NewPoll({ searchParams }: { searchParams: Promise<{ kind?: string; preset?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  if (!(await mayCreate(db(), member))) notFound();
  const { kind, preset } = await searchParams;
  const d = dates(locale, zone);
  const c = t.composer;
  const initial = preset === "pulse"
    ? pulseValue({ title: c.pulseTitle, scale: c.pulseScale, low: c.pulseLow, high: c.pulseHigh, enps: c.enpsDefault, text: c.pulseText })
    : emptyValue(isKind(kind) ? kind : "choice");
  return (
    <div className="narrow centred">
      <Composer
        mode="new"
        pollId={null}
        initial={initial}
        groups={await groups()}
        today={chestToday()}
        monthNames={d.monthNames()}
        weekdayNames={d.weekdayNames()}
        locale={locale}
        t={{ composer: t.composer, kinds: t.kinds, errors: t.errors, repeat: t.repeat }}
      />
    </div>
  );
}
