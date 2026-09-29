"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { Restore } from "../../../../../components/icons.tsx";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format } from "../../../../../lib/i18n/format.ts";
import { restoreVersion } from "../../../actions.ts";

// Restoring makes the old version the newest one; the version it replaced
// stays in the history, so restoring it again undoes this.
export function RestoreButton({ pageId, number, label, errors }: { pageId: string; number: number; label: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
      const result = await restoreVersion(pageId, number);
      if (!result.ok) return void toast({ text: format(errors[result.error], result.values), tone: "error" });
      router.push(`/chest/pages/${pageId}?restored=${number}`);
    })}><Restore />{label}</button>
  );
}
