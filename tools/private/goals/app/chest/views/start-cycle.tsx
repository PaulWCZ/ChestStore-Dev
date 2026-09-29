"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Plus, Upload } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { startFirstCycle } from "../actions.ts";

type Choice = { which: "current" | "next"; label: string };

// The first cycle in one click: the quarter the server chose (the next one
// near a quarter's end), with the other one as a quiet second choice; or
// that cycle and straight on to importing a spreadsheet (a company leaving
// Perdoo or its OKR sheet).
export function StartCycle({ main, other, importLabel, errors }: { main: Choice; other: Choice | null; importLabel: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const go = (which: Choice["which"], then = "/chest/company") => start(async () => {
    const r = await startFirstCycle(which);
    if (!r.ok) return setError(format(errors[r.error], r.values ?? {}));
    router.push(then === "import" ? `/chest/import?cycle=${r.value.id}` : then);
  });
  return (
    <>
      <button type="button" className="button" disabled={pending} onClick={() => go(main.which)}><Plus />{main.label}</button>
      <button type="button" className="button quiet" disabled={pending} onClick={() => go(main.which, "import")}><Upload />{importLabel}</button>
      {other && <button type="button" className="link-button" disabled={pending} onClick={() => go(other.which)}>{other.label}</button>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
