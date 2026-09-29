"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Folder } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { createRecord } from "../actions.ts";

// "Create their HR record" (HR, on a profile or in the list): one click,
// then the record opens, filled with what People already knows.
export function CreateRecord({ memberId, label, errors, quiet = true }: { memberId: string; label: string; errors: Record<ErrorCode, string>; quiet?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={quiet ? "button quiet small" : "button small"} disabled={pending} onClick={() => start(async () => {
      const r = await createRecord({ memberId });
      if (!r.ok) toast(format(errors[r.error], r.values ?? {}));
      else router.push(`/chest/records/${r.value.id}`);
    })}><Folder />{label}</button>
  );
}
