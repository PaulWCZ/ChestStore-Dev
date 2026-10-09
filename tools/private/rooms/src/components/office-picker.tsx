import { call, navigate } from "@argentic/chest-app/client";
import { Pin } from "./icons.tsx";

export type OfficePickerProps = { offices: { id: string; name: string }[]; current: string; label: string; path: string };

// Which office a page shows, when the company has several: the choice is
// remembered as the member's own office.
export function OfficePicker({ offices, current, label, path }: OfficePickerProps) {
  if (offices.length < 2) return null;
  return (
    <label className="office-picker">
      <Pin />
      <span className="visually-hidden">{label}</span>
      <select className="select" value={current} onChange={e => {
        const id = e.target.value;
        void call("setMyOffice", { officeId: id }, { refresh: false }).then(() => {
          const url = new URL(path, window.location.origin);
          url.searchParams.set("office", id);
          return navigate(url.pathname + url.search);
        });
      }}>
        {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
