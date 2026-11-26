import { navigate } from "@argentic/chest-app/client";
import { useRef } from "react";
import { Down } from "../components/icons.tsx";

// The answers' columns: tick the questions to show; the list follows at
// once (the choice lives in the address).
export function ColumnsPick({ base, keep, columns, label }: { base: string; keep: Record<string, string>; columns: { id: string; title: string; on: boolean }[]; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <details className="columns-pick">
      {/* A control that says it opens: a button's look, a chevron. */}
      <summary><span>{label}</span><span className="chevron" aria-hidden="true"><Down /></span></summary>
      <form ref={form} className="columns-form" method="get" action={base} aria-label={label}
        onChange={() => {
          const data = new URLSearchParams(keep);
          const chosen = [...(form.current?.querySelectorAll<HTMLInputElement>("input[name=cols]:checked") ?? [])].map(i => i.value);
          if (chosen.length) data.set("cols", chosen.join(","));
          void navigate(`${base}${data.size ? "?" + data : ""}`, { top: false });
        }}>
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {columns.map(c => (
          <label key={c.id} className="check">
            <input type="checkbox" name="cols" value={c.id} defaultChecked={c.on} />
            {c.title}
          </label>
        ))}
        <noscript><button type="submit" className="button small">{label}</button></noscript>
      </form>
    </details>
  );
}
