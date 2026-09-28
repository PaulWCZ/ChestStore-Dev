"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { addExample } from "./actions.ts";

// The one-click start of an empty wiki: an example handbook, in the
// editor's language, opened at its first page.
export function ExampleButton({ label, hint, errors }: { label: string; hint: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="example">
      <button type="button" className="button big" disabled={pending} onClick={() => start(async () => {
        const result = await addExample();
        if (!result.ok) return setError(format(errors[result.error], result.values));
        router.push(`/chest/pages/${result.value.pageId}?example=1`);
      })}>{label}</button>
      <p className="muted">{hint}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
