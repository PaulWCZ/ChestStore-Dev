import { call, toast } from "@argentic/chest-app/client";
import { Wave } from "../components/icons.tsx";
import { useBusy } from "../components/busy.ts";

// "Nora Petit now has access. Is this the person hired through Hiring?" —
// offered to HR when a newcomer appears whose name matches an arrival.
export function LinkSuggestion({ arrivalId, memberId, text, action, linked }: { arrivalId: string; memberId: string; text: string; action: string; linked: string }) {
  const [busy, run] = useBusy();
  const link = () => run(async () => {
    const r = await call("linkArrival", { id: arrivalId, memberId });
    if (r.ok) toast({ id: `link-${arrivalId}`, text: linked });
  });
  return (
    <div className="banner suggest">
      <Wave />
      <span>{text}</span>
      <button type="button" className="button small" disabled={busy} onClick={() => void link()}>{action}</button>
    </div>
  );
}
