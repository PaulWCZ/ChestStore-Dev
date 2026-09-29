"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { Check } from "../../../components/icons.tsx";
import { MapEmpty } from "../../../components/map-empty.tsx";
import { Progress } from "../../../components/progress.tsx";
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
    // One toast per check-in; its Undo says whether it worked (too late:
    // why not).
    toast({
      id: `check-in-${item.id}`,
      text: t.checkIn.done,
      undo: async () => {
        const back = await undoCheckIn(checkInId);
        if (!back.ok) return format(t.errors[back.error], back.values ?? {});
        setGone(g => g.filter(x => x !== item.id));
        start(() => router.refresh());
        return true;
      },
    });
    router.refresh();
  }

  if (shown.length === 0) {
    return (
      <MapEmpty icon={<Check />} title={t.home.allDone} body={t.home.allDoneBody} />
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
