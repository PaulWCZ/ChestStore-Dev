import { call, navigate, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { Check } from "../components/icons.tsx";

// "Solved" on a reported problem: the managers' bell item goes with it.
export function SolveButton({ id, label, done }: { id: string; label: string; done: string }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button type="button" className="button small quiet" disabled={pending} onClick={() => start(async () => {
      const r = await call("solveProblem", { id });
      if (!r.ok) return;
      setGone(true);
      toast(done);
    })}><Check />{label}</button>
  );
}
