import { navigate } from "@argentic/chest-app/client";
import { useEffect } from "react";

// On a phone the inbox's folders and saved views are one choice above the
// inbox ("Unassigned (3) ▾"): the first ticket stays near the top. On a
// narrow window they are a row of chips that slides sideways: the one shown
// is brought into view.
type Option = { value: string; label: string; href: string; view: boolean };

export function FolderSelect({ label, otherList, viewsLabel, current, options }: { label: string; otherList: string; viewsLabel: string; current: string; options: Option[] }) {
  useEffect(() => {
    const row = document.querySelector<HTMLElement>(".folders");
    const shown = row?.querySelector<HTMLElement>("a[aria-current=page]");
    if (row && shown && row.scrollWidth > row.clientWidth) row.scrollLeft = shown.offsetLeft - row.clientWidth / 2 + shown.offsetWidth / 2;
  }, [current]);
  const folders = options.filter(o => !o.view);
  const views = options.filter(o => o.view);
  return (
    <div className="folder-select">
      <label className="visually-hidden" htmlFor="folder-select">{label}</label>
      <select id="folder-select" className="field" value={current}
        onChange={e => { const to = options.find(o => o.value === e.target.value)?.href; if (to) void navigate(to); }}>
        {current === "" && <option value="">{otherList}</option>}
        {folders.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {views.length > 0 && <optgroup label={viewsLabel}>{views.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}
      </select>
    </div>
  );
}
