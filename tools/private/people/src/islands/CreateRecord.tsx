import { call, navigate } from "@argentic/chest-app/client";
import { Folder } from "../components/icons.tsx";
import { useBusy } from "../components/busy.ts";

// "Create their HR record" (HR, on a profile or in the register's gaps):
// one click, then the record opens, filled with what People already knows.
export function CreateRecord({ memberId, label, quiet = true }: { memberId: string; label: string; quiet?: boolean }) {
  const [busy, run] = useBusy();
  const create = () => run(async () => {
    const r = await call("createRecord", { memberId }, { refresh: false });
    if (r.ok) await navigate(`/chest/records/${r.value.id}`);
  });
  return <button type="button" className={quiet ? "button quiet small" : "button small"} disabled={busy} onClick={() => void create()}><Folder />{label}</button>;
}
