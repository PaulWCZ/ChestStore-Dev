"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Contours } from "../../../components/contours.tsx";
import { Check } from "../../../components/icons.tsx";
import { Progress } from "../../../components/progress.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { undoCheckIn } from "../actions.ts";
import { CheckInForm, type CheckInTarget, type CheckInWords } from "./check-in-form.tsx";

export type WaitingItem = CheckInTarget & { objectiveId: string; objectiveTitle: string; percent: number; percentText: string; stale: boolean; lastCheckIn: string | null };
type Words = CheckInWords & { home: Catalogue["home"]; objective: Catalogue["objective"]; progress: Catalogue["progress"] };

// This week's check-ins, one form each. A key result checked in leaves the
// list at once; the toast offers to take it back.
export function WaitingList({ items, t }: { items: WaitingItem[]; t: Words }) {
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const shown = items.filter(i => !gone.includes(i.id));

  function done(item: WaitingItem, checkInId: string) {
    setGone(g => [...g, item.id]);
    toast(t.checkIn.done, {
      label: t.checkIn.undo,
      run: () => start(async () => {
        const back = await undoCheckIn(checkInId);
        if (!back.ok) return toast(format(t.errors[back.error], back.values ?? {}));
        setGone(g => g.filter(x => x !== item.id));
        toast(t.checkIn.undone);
        router.refresh();
      }),
    });
    router.refresh();
  }

  if (shown.length === 0) {
    return (
      <div className="empty">
        <Contours variant="small" />
        <Check />
        <h2>{t.home.allDone}</h2>
        <p>{t.home.allDoneBody}</p>
      </div>
    );
  }
  return (
    <ul className="waiting">
      {shown.map(item => (
        <li key={item.id} className="card waiting-item">
          <div className="stack-s">
            <p className="where"><Link href={`/chest/objectives/${item.objectiveId}`}>{item.objectiveTitle}</Link></p>
            <h3>{item.title}</h3>
            <Progress percent={item.percent} text={item.percentText} label={`${t.progress.label}: ${item.percentText}`} confidence={item.confidence} />
            <p className="hint">
              {format(t.checkIn.now, { value: item.current })} · {item.lastCheckIn ? format(t.objective.lastCheckIn, { when: item.lastCheckIn }) : t.objective.never}
              {item.stale && <> · <span className="tag stale">{t.progress.staleShort}</span></>}
            </p>
          </div>
          <CheckInForm kr={item} t={t} onDone={d => done(item, d.checkInId)} />
        </li>
      ))}
    </ul>
  );
}
