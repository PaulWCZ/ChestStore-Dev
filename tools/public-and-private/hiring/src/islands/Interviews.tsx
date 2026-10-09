import { call, toast } from "@argentic/chest-app/client";
import { Confirm, StatusBadge } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Close } from "../components/icons.tsx";
import { useWork } from "../components/use-work.ts";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../shared/format.ts";

type MailState = "ready" | "later" | "off" | "unknown";

// A candidate's interviews and the links waiting for them to choose a
// time: a recruiter calls one off (the candidate told, or not), stops a
// link; "Add to my calendar" on a Chest without calendars.

export function Interviews({ list, links = [], manage, mailing = "unknown", t }: { list: { id: string; when: string; past: boolean; place: string; people: string; cancelled: boolean; ics: boolean }[]; links?: { id: string; from: string; to: string; people: string }[]; manage: boolean; mailing?: MailState; t: { interview: Catalogue["interview"]; common: Catalogue["common"] } }) {
  const [pending, start] = useWork();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tell, setTell] = useState(mailing !== "off");
  const w = t.interview;
  if (list.length === 0 && links.length === 0) return <p className="muted">{w.none}</p>;
  return (
    <>
      {links.length > 0 && (
        <ul className="meetings">
          {links.map(l => (
            <li key={l.id}>
              <span className="meet-when">{format(w.waiting, { from: l.from, to: l.to })}</span>
              {l.people && <span className="muted small">{l.people}</span>}
              {manage && (
                <span className="meet-actions">
                  <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => {
                    const r = await call("cancelInterviewLink", { id: l.id });
                    if (r.ok) toast(w.linkStopped);
                  })}><Close />{w.stopLink}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <ul className="meetings">
        {list.map(i => (
          <li key={i.id} className={i.cancelled ? "cancelled" : i.past ? "past" : undefined}>
            <span className="meet-when">{i.when}</span>
            <span className="muted small">{[i.people, i.place].filter(Boolean).join(" · ")}</span>
            {i.cancelled ? <StatusBadge size="s" label={w.cancelled} /> : (
              <span className="meet-actions">
                {i.ics && <a className="button link small" href={`/chest/interviews/${i.id}/ics`} download>{w.addToCalendar}</a>}
                {manage && !i.past && <button type="button" className="button link small" onClick={() => setCancelling(i.id)}><Close />{w.cancel}</button>}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Confirm
        open={cancelling !== null}
        title={w.cancelTitle}
        body={w.cancelBody}
        confirmLabel={w.cancelConfirm}
        cancelLabel={t.common.cancel}
        busy={pending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const id = cancelling;
          setCancelling(null);
          if (id) start(async () => {
            const r = await call("cancelInterview", { id, tell });
            if (!r.ok) return;
            toast(r.value.status === "sent" ? { id: `interview-${id}`, text: w.cancelledSent, sent: true } : w.cancelledToast);
          });
        }}
      >
        {mailing === "off"
          ? <p className="hint" data-mail="off">{w.cancelNoMail}</p>
          : <label className="check"><input type="checkbox" checked={tell} onChange={e => setTell(e.target.checked)} /><span>{w.tellCancel}</span></label>}
      </Confirm>
    </>
  );
}

