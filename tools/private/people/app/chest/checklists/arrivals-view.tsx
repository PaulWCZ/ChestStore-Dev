"use client";

import { Avatar, PeoplePicker, StatusBadge, useToast } from "@argentic/chest-ui/components";
import { localSearch, type Choice } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Trash, Wave } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { linkArrival, removeArrival } from "../actions.ts";
import { ArrivalForm, type ArrivalDraft, type ArrivalFormProps } from "./arrival-form.tsx";

// The arrivals: written by HR by hand, or told by another tool (Hiring) —
// who is coming, when, as what; HR starts their arrival checklist, links
// them to the member they became, corrects its own, or removes them.
export type ArrivalView = {
  id: string; name: string; details: string; when: string; cancelled: boolean; checklists: number;
  suggested: string | null; source: "hiring" | "manual"; draft: ArrivalDraft | null;
};
type Words = ArrivalFormProps["t"] & {
  arrivals: ArrivalFormProps["t"]["arrivals"] & {
    fromHiring: string; manual: string; cancelled: string; start: string; started: { one: string; other: string }; link: string;
    linkButton: string; linked: string; remove: string; removed: string; suggestion: string; suggestionAction: string;
  };
};
type Shared = Omit<ArrivalFormProps, "draft" | "t"> & { locale: string; t: Words };
type Said = { ok: true } | { ok: false; error: ErrorCode; values?: Record<string, string | number> };

export function ArrivalList({ arrivals, ...shared }: { arrivals: ArrivalView[] } & Shared) {
  return (
    <ul className="arrival-list">
      {arrivals.map(a => <ArrivalRow key={a.id} arrival={a} {...shared} />)}
    </ul>
  );
}

function ArrivalRow({ arrival: a, locale, ...form }: { arrival: ArrivalView } & Shared) {
  const { people, t } = form;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Choice[]>(() => people.filter(p => p.id === a.suggested));
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const run = (step: () => Promise<Said>, done: string) => start(async () => {
    const r = await step();
    if (!r.ok) toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
    else {
      toast(done);
      router.refresh();
    }
  });
  return (
    <li className={a.cancelled ? "arrival is-cancelled" : "arrival"}>
      <div className="arrival-id">
        <Avatar name={a.name} size="l" />
        <div>
          <strong>{a.name}</strong>
          <span className="muted">{a.details}</span>
          <span className="row tags">
            <span className="source">{a.source === "manual" ? t.arrivals.manual : t.arrivals.fromHiring}</span>
            {a.cancelled ? <StatusBadge size="s" tone="danger" label={t.arrivals.cancelled} /> : <span className="small">{a.when}</span>}
            {a.checklists !== 0 && <span className="muted small">{plural(t.arrivals.started, a.checklists, locale)}</span>}
          </span>
        </div>
      </div>
      <div className="arrival-actions">
        {!a.cancelled && (
          <>
            {a.checklists === 0 && <Link className="button small" href={`/chest/checklists/new?arrival=${a.id}`}><Wave />{t.arrivals.start}</Link>}
            <div className="link-row">
              <PeoplePicker label={t.arrivals.link} value={chosen} onChange={setChosen} search={searchPeople} labels={t.peoplePicker} lang={form.lang} />
              <button type="button" className="button quiet small" disabled={!chosen[0] || pending} onClick={() => run(() => linkArrival(a.id, chosen[0]!.id), t.arrivals.linked)}>{t.arrivals.linkButton}</button>
            </div>
          </>
        )}
        {a.draft && !a.cancelled && <ArrivalForm draft={a.draft} {...form} />}
        {(a.cancelled || a.checklists === 0) && (
          <button type="button" className="button quiet small danger" disabled={pending} onClick={() => run(() => removeArrival(a.id), t.arrivals.removed)}><Trash />{t.arrivals.remove}</button>
        )}
      </div>
    </li>
  );
}

// "Nora Petit now has access. Is this the person hired through Hiring?" —
// offered to HR when a newcomer appears whose name matches an arrival.
export function LinkSuggestion({ arrivalId, memberId, name, t }: { arrivalId: string; memberId: string; name: string; t: { arrivals: { suggestion: string; suggestionAction: string; linked: string }; errors: Record<ErrorCode, string> } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="banner suggest">
      <Wave />
      <span>{format(t.arrivals.suggestion, { name })}</span>
      <button type="button" className="button small" disabled={pending} onClick={() => start(async () => {
        const r = await linkArrival(arrivalId, memberId);
        if (!r.ok) toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
        else {
          toast(t.arrivals.linked);
          router.refresh();
        }
      })}>{t.arrivals.suggestionAction}</button>
    </div>
  );
}
