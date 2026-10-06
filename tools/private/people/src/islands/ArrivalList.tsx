import { Avatar, PeoplePicker, StatusBadge } from "@argentic/chest-ui/components";
import { localSearch, type Choice } from "@argentic/chest-ui/components/logic";
import { call, toast } from "@argentic/chest-app/client";
import { useMemo, useState } from "react";
import { useBusy } from "../components/busy.ts";
import { Trash, Wave } from "../components/icons.tsx";
import { ArrivalForm, type ArrivalDraft, type ArrivalFormProps } from "./ArrivalForm.tsx";

// The arrivals: written by HR by hand, or told by another tool (Hiring) —
// who is coming, when, as what; HR starts their arrival checklist, links
// them to the member they became, corrects its own, or removes them.
// Every word and date is written on the server.
export type ArrivalView = {
  id: string; name: string; details: string; when: string; cancelled: boolean; checklists: number;
  // "1 checklist started", written on the server.
  started: string;
  suggested: string | null; source: "hiring" | "manual"; draft: ArrivalDraft | null;
};
type Words = ArrivalFormProps["t"] & {
  arrivals: ArrivalFormProps["t"]["arrivals"] & {
    fromHiring: string; manual: string; cancelled: string; start: string; link: string;
    linkButton: string; linked: string; remove: string; removed: string;
  };
};
type Shared = Omit<ArrivalFormProps, "draft" | "t"> & { t: Words };

export function ArrivalList({ arrivals, ...shared }: { arrivals: ArrivalView[] } & Shared) {
  return (
    <ul className="arrival-list">
      {arrivals.map(a => <ArrivalRow key={a.id} arrival={a} {...shared} />)}
    </ul>
  );
}

function ArrivalRow({ arrival: a, ...form }: { arrival: ArrivalView } & Shared) {
  const { people, t } = form;
  const [pending, run] = useBusy();
  const [chosen, setChosen] = useState<Choice[]>(() => people.filter(p => p.id === a.suggested));
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const link = () => run(async () => {
    const r = await call("linkArrival", { id: a.id, memberId: chosen[0]?.id ?? "" });
    if (r.ok) toast({ id: `arrival-${a.id}`, text: t.arrivals.linked });
  });
  const remove = () => run(async () => {
    const r = await call("removeArrival", { id: a.id });
    if (r.ok) toast({ id: `arrival-${a.id}`, text: t.arrivals.removed });
  });
  return (
    <li id={`arrival-${a.id}`} className={a.cancelled ? "arrival is-cancelled" : "arrival"}>
      <div className="arrival-id">
        <Avatar name={a.name} size="l" />
        <div>
          <strong>{a.name}</strong>
          <span className="muted">{a.details}</span>
          <span className="row tags">
            <span className="source">{a.source === "manual" ? t.arrivals.manual : t.arrivals.fromHiring}</span>
            {a.cancelled ? <StatusBadge size="s" tone="danger" label={t.arrivals.cancelled} /> : <span className="small">{a.when}</span>}
            {a.checklists !== 0 && <span className="muted small">{a.started}</span>}
          </span>
        </div>
      </div>
      <div className="arrival-actions">
        {!a.cancelled && (
          <>
            {a.checklists === 0 && <a className="button small" href={`/chest/checklists/new?arrival=${a.id}`}><Wave />{t.arrivals.start}</a>}
            <div className="link-row">
              <PeoplePicker label={t.arrivals.link} value={chosen} onChange={setChosen} search={searchPeople} labels={t.peoplePicker} lang={form.lang} />
              <button type="button" className="button quiet small" disabled={!chosen[0] || pending} onClick={() => void link()}>{t.arrivals.linkButton}</button>
            </div>
          </>
        )}
        {a.draft && !a.cancelled && <ArrivalForm draft={a.draft} {...form} />}
        {(a.cancelled || a.checklists === 0) && (
          <button type="button" className="button quiet small danger" disabled={pending} onClick={() => void remove()}><Trash />{t.arrivals.remove}</button>
        )}
      </div>
    </li>
  );
}
