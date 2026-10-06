import type { Catalogue } from "../lib/i18n/index.ts";

// What a subscriber follows: everything (the default) or some components.
// Plain radio buttons and boxes: it works without JavaScript.
export type Option = { id: string; label: string };

export function ChoiceFields({ options, chosen, t }: { options: Option[]; chosen: string[] | null; t: Catalogue["subscribe"] }) {
  const some = chosen !== null;
  return (
    <fieldset className="choices">
      <legend>{t.which}</legend>
      <label className="choice"><input type="radio" name="scope" value="all" defaultChecked={!some} />{t.all}</label>
      <label className="choice"><input type="radio" name="scope" value="some" defaultChecked={some} />{t.some}</label>
      <div className="choice-list">
        {options.map(o => (
          <label key={o.id} className="choice small"><input type="checkbox" name="component" value={o.id} defaultChecked={chosen?.includes(o.id) ?? false} />{o.label}</label>
        ))}
      </div>
    </fieldset>
  );
}
