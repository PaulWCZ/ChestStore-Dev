import { call, navigate } from "@argentic/chest-app/client";
import { useState } from "react";
import { Alert } from "../components/icons.tsx";

// One click: an example company objective with three key results, to see
// what a good one looks like (and change it, or remove it). Then its page.
export function AddExample({ cycleId, label }: { cycleId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    if (pending) return;
    setPending(true);
    const r = await call("addExample", { cycleId }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok) return setError(r.message);
    await navigate(`/chest/objectives/${r.value.id}`);
  }
  return (
    <>
      <button type="button" className="button quiet" disabled={pending} aria-busy={pending} onClick={() => void add()}>{label}</button>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
