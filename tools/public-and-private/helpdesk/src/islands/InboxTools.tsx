import { call, fill, navigate, onLinkClick, toast } from "@argentic/chest-app/client";
import { Dialog, Filters, SearchBox, type FilterGroup } from "@argentic/chest-ui/components";
import type { DialogWords, FilterWords, SearchWords } from "@argentic/chest-ui/components/logic";
import { useId, useState, type ReactNode } from "react";
import { Sliders, Star } from "../components/icons.tsx";
import type { ViewParams } from "../lib/views.ts";

type Words = {
  search: SearchWords;
  filters: FilterWords;
  filterButton: string;
  saveView: string; viewName: string; viewSave: string; viewSaved: string; viewRemoved: string; removeView: string; cancel: string;
  dialog: DialogWords;
};

// Above the inbox: the search (/ focuses it), and the filters in the kit's
// chips — a priority, a tag, the order. Each filter is a link (the address
// keeps it: Back and a shared link work), followed in place (the ticked
// tickets' bar stays). On a phone the filters wait behind one "Filter (n)"
// button, so the first ticket is near the top of the screen; on a wider
// screen they are all shown. "Save this view" keeps what the inbox shows
// under a name, in everyone's side column (named in the kit's dialog: a
// typed name is never lost to a stray click); a view shown may be deleted
// by its maker or an administrator, with Undo.
export function InboxTools({ q, params, filterCount, groups, savable, removable, t }: { q: string; params: Record<string, string>; filterCount: number; groups: FilterGroup[]; savable: ViewParams | null; removable: string | null; t: Words }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const link = ({ href, className, children, ...rest }: { href: string; className?: string; "aria-current"?: "true"; children: ReactNode }) => <a href={href} className={className} {...rest} onClick={event => onLinkClick(event, { top: false })}>{children}</a>;
  return (
    <div className="inbox-tools">
      <SearchBox action="/chest" id="q" value={q} maxLength={100} labels={t.search} />
      <button type="button" className="ck-button ck-button-quiet ck-button-small filter-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <Sliders />{t.filterButton}
        {filterCount > 0 && <span className="n">{filterCount}</span>}
      </button>
      <div id={panel} className={open ? "filter-more open" : "filter-more"}>
        <div className="filters-line">
          <Filters path="/chest" params={params} groups={groups} labels={t.filters} link={link} onNavigate={href => void navigate(href, { top: false })} phone="scroll" />
          {savable && <SaveView params={savable} t={t} />}
          {removable && <RemoveView id={removable} t={t} />}
        </div>
      </div>
    </div>
  );
}

function SaveView({ params, t }: { params: ViewParams; t: Words }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => { setOpen(false); setName(""); setError(null); };
  async function save() {
    setPending(true);
    const r = await call("saveView", { name, params }, { quiet: true });
    setPending(false);
    if (!r.ok) return setError(r.message);
    close();
    const view = r.value;
    toast({ id: `view-${view.id}`, text: t.viewSaved, undo: async () => (await call("removeView", { id: view.id }, { quiet: true })).ok });
  }
  return (
    <>
      <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={() => setOpen(true)}><Star />{t.saveView}</button>
      <Dialog open={open} title={t.saveView} onClose={close} dirty={name.trim() !== ""} size="s" labels={t.dialog}
        footer={<>
          <button type="button" className="ck-button ck-button-quiet" onClick={close}>{t.cancel}</button>
          <button type="submit" form="save-view" className="ck-button" disabled={pending || !name.trim()}>{t.viewSave}</button>
        </>}>
        <form id="save-view" className="stack" onSubmit={e => { e.preventDefault(); void save(); }}>
          <div>
            <label className="label" htmlFor="view-name">{t.viewName}</label>
            <input id="view-name" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={40} required aria-describedby={error ? "view-error" : undefined} />
          </div>
          {error && <p id="view-error" className="error" role="alert">{error}</p>}
        </form>
      </Dialog>
    </>
  );
}

// Deleting a view (from the inbox while it shows): it is gone for the
// whole team, and Undo brings it back.
function RemoveView({ id, t }: { id: string; t: Words }) {
  const [pending, setPending] = useState(false);
  return (
    <button type="button" className="link-button danger" disabled={pending} onClick={async () => {
      setPending(true);
      const r = await call("removeView", { id });
      setPending(false);
      if (!r.ok) return;
      const gone = r.value;
      toast({ id: `view-${id}`, text: fill(t.viewRemoved, { name: gone.name }), undo: async () => (await call("restoreView", { name: gone.name, params: gone.params }, { quiet: true })).ok });
    }}>{t.removeView}</button>
  );
}
