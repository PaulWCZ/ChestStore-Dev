"use client";

import { useState, useTransition } from "react";
import { solveProblem } from "../app/chest/actions.ts";
import { format } from "../lib/i18n/format.ts";
import { Check } from "./icons.tsx";
import { useToast } from "./toast.tsx";

// "Solved" on a reported problem: the managers' bell item goes with it.
export function SolveButton({ id, label, done, errors }: { id: string; label: string; done: string; errors: Record<string, string> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button type="button" className="button small quiet" disabled={pending} onClick={() => start(async () => {
      const r = await solveProblem(id);
      if (!r.ok) return toast(format(errors[r.error] ?? errors["unknown"] ?? "", r.values));
      setGone(true);
      toast(done);
    })}><Check />{label}</button>
  );
}
