import { call, navigate } from "@argentic/chest-app/client";
import { useState } from "react";
import { Alert, Plus, Upload } from "../components/icons.tsx";

type Choice = { which: "current" | "next"; label: string };

// The first cycle in one click: the quarter the server chose (the next one
// near a quarter's end), with the other one as a quiet second choice; or
// that cycle and straight on to importing a spreadsheet (a company leaving
// Perdoo or its OKR sheet).
export function StartCycle({ main, other, importLabel }: { main: Choice; other: Choice | null; importLabel: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(which: Choice["which"], then: "company" | "import" = "company") {
    if (pending) return;
    setPending(true);
    const r = await call("startFirstCycle", { which }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok) return setError(r.message);
    await navigate(then === "import" ? `/chest/import?cycle=${r.value.id}` : "/chest/company");
  }
  return (
    <>
      <button type="button" className="button" disabled={pending} aria-busy={pending} onClick={() => void go(main.which)}><Plus />{main.label}</button>
      <button type="button" className="button quiet" disabled={pending} onClick={() => void go(main.which, "import")}><Upload />{importLabel}</button>
      {other && <button type="button" className="link-button" disabled={pending} onClick={() => void go(other.which)}>{other.label}</button>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
