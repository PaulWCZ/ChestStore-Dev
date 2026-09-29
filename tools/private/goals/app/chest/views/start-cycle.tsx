"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Plus } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { startFirstCycle } from "../actions.ts";

type Choice = { which: "current" | "next"; label: string };

// The first cycle in one click: the quarter the server chose (the next one
// near a quarter's end), with the other one as a quiet second choice.
export function StartCycle({ main, other, errors }: { main: Choice; other: Choice | null; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const go = (which: Choice["which"]) => start(async () => {
    const r = await startFirstCycle(which);
    if (!r.ok) return setError(format(errors[r.error], r.values ?? {}));
    router.push("/chest/company");
  });
  return (
    <>
      <button type="button" className="button" disabled={pending} onClick={() => go(main.which)}><Plus />{main.label}</button>
      {other && <button type="button" className="link-button" disabled={pending} onClick={() => go(other.which)}>{other.label}</button>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
