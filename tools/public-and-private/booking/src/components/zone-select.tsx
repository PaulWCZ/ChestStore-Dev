import { modernZone, type ZoneGroup } from "../lib/zones.ts";

// A time zone picker: the groups and their words come from the server
// (lib/zones.ts: cities, offsets, regions), so the page renders the same
// in the browser. A zone not in the list (an old name a browser gives) is
// offered on top, as it is.
export function ZoneSelect({ id, name, value, groups, onChange, className = "field", describedBy }: { id: string; name?: string; value: string; groups: ZoneGroup[]; onChange?: (zone: string) => void; className?: string; describedBy?: string }) {
  const current = modernZone(value);
  const listed = groups.some(g => g.zones.some(z => z.value === current));
  return (
    <select id={id} name={name} className={className} aria-describedby={describedBy} {...(onChange ? { value: current, onChange: e => onChange(e.target.value) } : { defaultValue: current })}>
      {!listed && <option value={current}>{current.split("/").at(-1)?.replace(/_/gu, " ") ?? current}</option>}
      {groups.map(g => (
        <optgroup key={g.region} label={g.region}>
          {g.zones.map(z => <option key={g.region + z.value} value={z.value}>{z.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
