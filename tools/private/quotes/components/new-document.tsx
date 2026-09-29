"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createDocument } from "../app/chest/actions.ts";

// Starts a draft (a quote or an invoice, for a client when one is named)
// and opens it: the paper is the form.
export function NewDocument({ type, clientId = null, className = "button", errors, children }: { type: "quote" | "invoice"; clientId?: string | null; className?: string; errors: Record<string, string>; children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} onClick={async () => {
      setBusy(true);
      const result = await createDocument(type, clientId);
      if (result.ok) router.push(`/chest/documents/${result.value.id}`);
      else {
        setBusy(false);
        toast({ text: errors[result.error] ?? errors["unknown"] ?? "", tone: "error" });
      }
    }}>
      {children}
    </button>
  );
}
