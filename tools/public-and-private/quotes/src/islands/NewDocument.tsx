import { call, navigate } from "@argentic/chest-app/client";
import { useState } from "react";
import { Plus } from "../components/icons.tsx";

// Starts a draft (a quote or an invoice, for a client when one is named)
// and opens it: the paper is the form. A refusal is the package's toast.
export function NewDocument({ type, clientId = null, className = "button", label }: { type: "quote" | "invoice"; clientId?: string | null; className?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} aria-busy={busy || undefined} onClick={async () => {
      setBusy(true);
      const made = await call("createDocument", { type, ...(clientId ? { clientId } : {}) }, { refresh: false });
      if (made.ok) navigate(`/chest/documents/${made.value.id}`);
      else setBusy(false);
    }}>
      <Plus />{label}
    </button>
  );
}
