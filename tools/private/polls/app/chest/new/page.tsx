import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { groups } from "../../../lib/audience.ts";
import { dates } from "../../../lib/dates.ts";
import { isKind } from "../../../lib/model.ts";
import { viewer } from "../../../lib/session.ts";
import { chestToday } from "../../../lib/zone.ts";
import { emptyValue } from "../../../lib/composer-value.ts";
import { Composer } from "../composer.tsx";

// A new poll, of the kind chosen on the home page (a question by default).
export default async function NewPoll({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  if (!can(member, "create")) notFound();
  const { kind } = await searchParams;
  const d = dates(locale, zone);
  return (
    <div className="narrow centred">
      <Composer
        mode="new"
        pollId={null}
        initial={emptyValue(isKind(kind) ? kind : "choice")}
        groups={await groups()}
        today={chestToday()}
        monthNames={d.monthNames()}
        weekdayNames={d.weekdayNames()}
        locale={locale}
        t={{ composer: t.composer, kinds: t.kinds, errors: t.errors }}
      />
    </div>
  );
}
