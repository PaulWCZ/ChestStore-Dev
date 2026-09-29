"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Restore } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { restoreForm } from "../../actions.ts";

export function RestoreButton({ formId, label, done, errors }: { formId: string; label: string; done: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" className="button quiet small" disabled={pending} onClick={() => start(async () => {
      const r = await restoreForm(formId);
      if (!r.ok) return void toast(format(errors[r.error] ?? errors.unknown, r.values ?? {}));
      toast(done);
      router.push(`/chest/forms/${formId}`);
    })}><Restore />{label}</button>
  );
}
