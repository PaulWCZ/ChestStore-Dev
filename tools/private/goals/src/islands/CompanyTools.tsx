import { navigate } from "@argentic/chest-app/client";
import { Filters, Menu, PeoplePicker, type FilterGroup } from "@argentic/chest-ui/components";
import { localSearch, type FilterWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useId, useState } from "react";
import { Download, Gear, Shape, Upload } from "../components/icons.tsx";
import { Progress } from "../components/progress.tsx";

type Params = Record<string, string | undefined>;
type Owner = { id: string; name: string; photo: string | null };
type Tally = { on_track: number; at_risk: number; off_track: number; stale: number };

export type CompanyToolsProps = {
  path: string;
  params: Params;
  // The cycle shown (the kit's filter group with one value always).
  cycle: FilterGroup;
  // The spreadsheet menu: import (admins, an open cycle) and download.
  menu: { label: string; importHref: string | null; importLabel: string; exportHref: string; exportLabel: string };
  // The company's progress and the tally (null: no objective yet).
  overview: { title: string; percent: number | null; percentText: string; label: string; summary: string; counts: string; tally: Tally; words: { on_track: string; at_risk: string; off_track: string; stale: string } } | null;
  // How it goes, a team, an owner once chosen (null: no objective yet).
  filters: { groups: FilterGroup[]; owners: Owner[]; ownerChosen: boolean; ownerLabel: string; picker: PeoplePickerWords; lang: string } | null;
  // "Filters" on a phone, and how many are on.
  fold: { label: string; on: number; onLabel: string };
  labels: FilterWords;
};

// The Company page's tools, above its tree: the cycle, the spreadsheet
// menu, the company's progress and tally, the filters (how it goes, a
// team, an owner typed by name). On a phone the choices fold behind one
// "Filters" button, so the tree shows first — as Tasks folds a board's
// view and filters; on a larger screen they are all in sight and the
// button is not there (src/styles.css, .fold-area). The fold is kept when
// the page reads itself again (the island's state).
export function CompanyTools({ path, params, cycle, menu, overview, filters, fold, labels }: CompanyToolsProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const foldable = overview ? "foldable" : "";
  // The owner: a person among those who own something in the cycle, typed
  // by name (the kit's picker); choosing goes to the same view narrowed to
  // them, letting go widens it again.
  const goOwner = (owner: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "owner") q.set(k, v);
    if (owner) q.set("owner", owner);
    void navigate(`${path}?${q.toString()}`, { top: false });
  };
  return (
    <div id={id} className={`fold-area${open ? " is-open" : ""}`}>
      <div className="tree-tools">
        {overview && (
          <button type="button" className="fold-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
            <Gear />{fold.label}{fold.on > 0 && <span className="count" aria-label={fold.onLabel}>{fold.on}</span>}
          </button>
        )}
        <div className={foldable}><Filters path={path} params={params} groups={[cycle]} labels={labels} /></div>
        {/* Rare actions, in one menu: the tree comes first on a phone. */}
        <div className="end">
          <Menu label={menu.label} showLabel items={[
            ...(menu.importHref ? [{ label: menu.importLabel, href: menu.importHref, icon: <Upload /> }] : []),
            { label: menu.exportLabel, href: menu.exportHref, download: true, icon: <Download /> },
          ]} />
        </div>
      </div>
      {overview && (
        <div className="overview">
          <div className="card">
            <span className="eyebrow">{overview.title}</span>
            <Progress percent={overview.percent} text={overview.percentText} label={overview.label} big />
            <p className="hint">{overview.summary}</p>
            {/* On a phone, the confidence in one line under the progress. */}
            <ul className="tally compact phone-only" aria-label={overview.counts}>
              {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><strong>{overview.tally[c]}</strong><span>{overview.words[c]}</span></li>)}
            </ul>
          </div>
          <div className="card">
            <span className="eyebrow">{overview.counts}</span>
            <ul className="tally">
              {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><strong>{overview.tally[c]}</strong><span>{overview.words[c]}</span></li>)}
              {overview.tally.stale > 0 && <li><strong>{overview.tally.stale}</strong><span>{overview.words.stale}</span></li>}
            </ul>
          </div>
        </div>
      )}
      {filters && (
        <div className="filters foldable">
          <Filters path={path} params={params} groups={filters.groups} labels={labels} />
          {!filters.ownerChosen && (
            <div className="owner-filter">
              <PeoplePicker label={filters.ownerLabel} value={[]} onChange={v => goOwner(v[0]?.id ?? null)} search={localSearch(filters.owners)} suggestions={filters.owners} suggestionsLabel={filters.picker.suggested ?? ""} labels={filters.picker} lang={filters.lang} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
