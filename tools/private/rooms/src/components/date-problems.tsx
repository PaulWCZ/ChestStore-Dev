"use client";

import { DateField, type DateFieldProps } from "@argentic/chest-ui/components";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

// Since kit 0.2.4 a DateField refuses a day it cannot read, or one before
// its `min` or after its `max`: it keeps the text as typed, says why under
// itself, and does NOT call onChange, so the form's own state still holds
// the previous day. A form that saves from that state (its submit reads
// React state, or a button's onClick) must then wait: sending the old day
// in place of what was typed is the bug this guards against.
//
// `useDateProblems()` keeps each field's refusal under a key: `watch(key)`
// is that field's onProblem, `problem` the first refusal standing (null
// when none), `of(key)` one field's (a page of several forms). The form's
// submit refuses while a refusal stands and puts the focus back on that
// field, whose sentence says why. Its Save stays enabled: a person who
// corrects "29/10" and clicks Save in one move is read on that click's
// blur (kit 0.2.5), so a Save disabled until then would swallow the click.
// Fields are `WatchedDateField`s: one that leaves the page (hidden by
// another choice, its dialog closed) forgets its refusal, so a field no
// longer shown never blocks the Save.
//
// (The same helper as Equipment's; kept here so the tool stands alone.)
export function useDateProblems(): { problem: string | null; of: (key: string) => string | null; watch: (key: string) => (problem: string | null) => void } {
  const [problems, setProblems] = useState<ReadonlyMap<string, string>>(() => new Map());
  const watch = useCallback((key: string) => (problem: string | null) => setProblems(all => {
    if ((all.get(key) ?? null) === problem) return all;
    const next = new Map(all);
    if (problem) next.set(key, problem);
    else next.delete(key);
    return next;
  }), []);
  return { problem: problems.values().next().value ?? null, of: key => problems.get(key) ?? null, watch };
}

// The kit's DateField, telling its onProblem `null` when it leaves the page.
export function WatchedDateField(props: DateFieldProps): ReactElement {
  const onProblem = useRef(props.onProblem);
  useEffect(() => { onProblem.current = props.onProblem; });
  useEffect(() => () => onProblem.current?.(null), []);
  return <DateField {...props} />;
}
