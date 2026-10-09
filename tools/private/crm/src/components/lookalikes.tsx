import { call } from "@argentic/chest-app/client";
import { useEffect, useState } from "react";
import type { Lookalike } from "../lib/search.ts";
import type { Words } from "./shared.ts";

// While a person types a new company or contact, what already looks like
// it: a warning with a link, never a refusal.
export function Lookalikes({ kind, name, email, website, except, t }: { kind: "company" | "contact"; name: string; email?: string; website?: string; except?: string; t: Words<"common"> }) {
  const [found, setFound] = useState<Lookalike[]>([]);
  useEffect(() => {
    if (name.trim().length < 2 && !(email ?? "").includes("@") && (website ?? "").length < 4) {
      setFound([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const r = await call("checkLookalikes", { kind, name, ...(email ? { email } : {}), ...(website ? { website } : {}), ...(except ? { except } : {}) }, { refresh: false, quiet: true });
      if (live && r.ok) setFound(r.value);
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, name, email, website, except]);
  if (found.length === 0) return null;
  const why = { name: t.common.looksLikeName, email: t.common.looksLikeEmail, domain: t.common.looksLikeDomain };
  return (
    <div className="lookalikes" role="status">
      <strong>{t.common.looksLike}</strong>
      <ul>
        {found.map(f => (
          <li key={f.id}>
            <a href={`/chest/${kind === "company" ? "companies" : "contacts"}/${f.id}`}>{f.name}</a>
            <span className="muted"> · {why[f.why]}{f.detail ? ` · ${f.detail}` : ""}</span>
          </li>
        ))}
      </ul>
      <span className="hint">{t.common.lookAnyway}</span>
    </div>
  );
}
