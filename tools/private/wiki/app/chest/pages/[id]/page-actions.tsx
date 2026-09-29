"use client";

import { Dialog, Menu, useToast, type MenuItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, Check, Clock, Dots, Download, Eye, Move, Pen, People, Pin, Plus, Printer, Seal, Stamp, Trash } from "../../../../components/icons.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "../../../../components/new-page.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import { askRead, confirmRead, deletePage, setPinned, discardDraft, keepDraft, markReviewed, movePage, restorePage, setReview, setTemplate, setWatching } from "../../actions.ts";

export type TemplateWords = { tag: string; mark: string; unmark: string; marked: string; unmarked: string };
type Words = NewPageWords & { page: Catalogue["page"]; move: Catalogue["move"]; shell: Catalogue["shell"]; watch: Catalogue["watch"]; review: Omit<Catalogue["review"], "due">; reads: Catalogue["reads"]; marks: TemplateWords; spaceName: string; locale: string };
// What the page's reader has set on it: watching, a template, a reminder.
export type PageState = { watching: boolean; template: boolean; review: { months: number | null; ownerName: string | null; mine: boolean }; readAsked: boolean; pinned: boolean; private?: boolean };
const reviewChoices = [3, 6, 12] as const;
export type MovePlace = { spaces: { id: string; name: string }[]; nodes: { id: string; spaceId: string; parentId: string | null; title: string }[] };

// The actions of a page: "Edit" first (editors), then a menu for the rest —
// a page inside, move, history, print, download, delete (with undo).
export function PageActions({ page, writer, editHref, t, places, state, groups = [] }: { page: { id: string; title: string; spaceId: string; parentId: string | null; hasChildren: boolean }; writer: boolean; editHref: string; t: Words; places?: MovePlace; state: PageState; groups?: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [child, setChild] = useState<PageTarget | null>(null);
  const [watching, setWatched] = useState(state.watching);
  const [pending, start] = useTransition();

  function watch() {
    const next = !watching;
    setWatched(next);
    start(async () => {
      const result = await setWatching(page.id, next);
      if (!result.ok) {
        setWatched(!next);
        return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      }
      toast({ id: `watch-${page.id}`, text: next ? t.watch.on : t.watch.off });
    });
  }

  function template() {
    const next = !state.template;
    start(async () => {
      const result = await setTemplate(page.id, next);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `template-${page.id}`, text: format(next ? t.marks.marked : t.marks.unmarked, { title: page.title, space: t.spaceName }) });
    });
  }

  function pin() {
    const next = !state.pinned;
    start(async () => {
      const result = await setPinned(page.id, next);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `pin-${page.id}`, text: next ? t.page.pinned : t.page.unpinned });
    });
  }

  function remove() {
    start(async () => {
      const result = await deletePage(page.id);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      const below = result.value.pages - 1;
      const text = below > 0 ? plural(t.page.deletedWith, below, t.locale, { title: page.title }) : format(t.page.deleted, { title: page.title });
      router.push(page.parentId ? `/chest/pages/${page.parentId}` : `/chest/spaces/${page.spaceId}`);
      // One toast per page; its Undo takes the page out of the trash and
      // says whether it could (the kit's toast).
      toast({
        id: `delete-${page.id}`,
        text,
        undo: async () => {
          const back = await restorePage(page.id);
          if (!back.ok) return format(t.errors[back.error], back.values);
          router.push(`/chest/pages/${page.id}`);
          return true;
        },
      });
    });
  }

  return (
    <div className="actions">
      <button type="button" className="button quiet watch" aria-pressed={watching} title={t.watch.hint} onClick={watch}>
        {watching ? <Check /> : <Eye />}<span className="label">{watching ? t.watch.watching : t.watch.watch}</span>
      </button>
      {writer && <Link className="button" href={editHref}><Pen />{t.page.edit}</Link>}
      <Menu label={t.page.more} icon={<Dots />} showLabel size="m" link={Link} items={[
        ...(writer ? [{ label: t.shell.newSubpage, icon: <Plus />, onSelect: () => setChild({ spaceId: page.spaceId, spaceName: t.spaceName, parentId: page.id, parentTitle: page.title }) }] : []),
        ...(writer && places ? [{ label: t.page.move, icon: <Move />, onSelect: () => setMoving(true) }] : []),
        ...(writer ? [{ label: state.pinned ? t.page.unpin : t.page.pin, icon: <Pin />, disabled: pending, onSelect: pin }] : []),
        ...(writer ? [{ label: state.template ? t.marks.unmark : t.marks.mark, icon: <Stamp />, disabled: pending, onSelect: template }] : []),
        // Nobody else reads a page of "My pages": nobody to ask.
        ...(writer && !state.private ? [state.readAsked ? { label: t.reads.menuSeen, icon: <People />, href: `/chest/pages/${page.id}/reads` } : { label: t.reads.menu, icon: <Seal />, onSelect: () => setAsking(true) }] : []),
        ...(writer ? [{ label: state.review.months ? format(t.review.menuSet, { months: state.review.months }) : t.review.menu, icon: <Calendar />, onSelect: () => setReviewing(true) }] : []),
        { label: t.page.history, icon: <Clock />, href: `/chest/pages/${page.id}/history` },
        { label: t.page.print, icon: <Printer />, onSelect: () => window.print() },
        { label: t.page.exportMarkdown, icon: <Download />, href: `/chest/pages/${page.id}/export?format=md`, download: true },
        { label: t.page.exportHtml, icon: <Download />, href: `/chest/pages/${page.id}/export?format=html`, download: true },
        ...(page.hasChildren ? [{ label: t.page.exportZip, icon: <Download />, href: `/chest/pages/${page.id}/export?format=zip`, download: true }] : []),
        ...(writer ? [{ label: t.page.delete, icon: <Trash />, tone: "danger" as const, disabled: pending, onSelect: remove }] : []),
      ] satisfies MenuItem[]} />
      {places && <MoveDialog open={moving} onClose={() => setMoving(false)} page={page} places={places} t={t} />}
      {writer && <AskReadDialog open={asking} onClose={() => setAsking(false)} page={page} groups={groups} t={t} />}
      {writer && <ReviewDialog open={reviewing} onClose={() => setReviewing(false)} page={page} review={state.review} t={t} />}
      <NewPageDialog target={child} onClose={() => setChild(null)} t={t} />
    </div>
  );
}

// Where to move a page: a space, then the top of it or inside one of its
// pages (never the page itself nor its own pages). Works with a keyboard
// and on a phone, where dragging in the sidebar does not.
function MoveDialog({ open, onClose, page, places, t }: { open: boolean; onClose: () => void; page: { id: string; title: string; spaceId: string; parentId: string | null }; places: MovePlace; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [spaceId, setSpaceId] = useState(page.spaceId);
  const [parent, setParent] = useState<string>(page.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(places.nodes.map(n => [n.id, n]));
  const within = (id: string): boolean => {
    for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) if (n.id === page.id) return true;
    return false;
  };
  // The space's pages in tree order, with their depth.
  const ordered: { id: string; title: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of places.nodes.filter(x => x.spaceId === spaceId && x.parentId === parentId)) {
      if (within(n.id)) continue;
      ordered.push({ id: n.id, title: n.title, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  function submit() {
    setError(null);
    start(async () => {
      const result = await movePage(page.id, { spaceId, parentId: parent || null, index: null });
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.refresh();
      toast({ id: `move-${page.id}`, text: t.shell.moved });
    });
  }
  return (
    <Dialog open={open} title={format(t.move.title, { title: page.title })} labels={t.dialog} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div>
          <label className="label" htmlFor="move-space">{t.move.space}</label>
          <select id="move-space" className="field" value={spaceId} onChange={e => { setSpaceId(e.target.value); setParent(""); }}>
            {places.spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <fieldset className="plain">
          <legend className="label">{t.move.where}</legend>
          <div className="places">
            <label className="choice"><input type="radio" name="parent" value="" checked={parent === ""} onChange={() => setParent("")} />{t.move.top}</label>
            {ordered.map(n => (
              <label key={n.id} className={`choice depth-${Math.min(n.depth, 6)}`}>
                <input type="radio" name="parent" value={n.id} checked={parent === n.id} onChange={() => setParent(n.id)} />
                {format(t.move.under, { title: n.title })}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-foot">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={pending}>{t.move.submit}</button>
        </div>
      </form>
    </Dialog>
  );
}

// How often to check the page: never, or every 3, 6 or 12 months. Saving
// makes the editor the one reminded.
function ReviewDialog({ open, onClose, page, review, t }: { open: boolean; onClose: () => void; page: { id: string; title: string }; review: PageState["review"]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [months, setMonths] = useState<number | null>(review.months);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    setError(null);
    start(async () => {
      const result = await setReview(page.id, months);
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.refresh();
      toast({ id: `review-${page.id}`, text: months ? format(t.review.set, { months }) : t.review.cleared });
    });
  }
  return (
    <Dialog open={open} title={t.review.title} labels={t.dialog} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="where">{format(t.review.intro, { title: page.title })}</p>
        <fieldset className="plain">
          <legend className="visually-hidden">{t.review.title}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="review" checked={months === null} onChange={() => setMonths(null)} />{t.review.never}</label>
            {reviewChoices.map(m => (
              <label key={m} className="choice"><input type="radio" name="review" checked={months === m} onChange={() => setMonths(m)} />{format(t.review.every, { months: m })}</label>
            ))}
          </div>
        </fieldset>
        {review.months && review.ownerName && !review.mine && <p className="muted small">{format(t.review.owner, { name: review.ownerName })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-foot">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={pending}>{t.review.save}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A page due for its check asks its editors, once, on top: "Still correct"
// settles it for months; "Update it" opens the editor.
export function ReviewAsk({ pageId, text, months, editHref, t }: { pageId: string; text: string; months: number; editHref: string; t: { stillCorrect: string; update: string; done: string; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const result = await markReviewed(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `reviewed-${pageId}`, text: format(t.done, { months }) });
    });
  }
  return (
    <div className="notice ask-review" role="status">
      <Calendar />
      <p>{text}</p>
      <div className="row-actions">
        <button type="button" className="button small" disabled={pending} onClick={confirm}><Check />{t.stillCorrect}</button>
        <Link className="button small quiet" href={editHref}><Pen />{t.update}</Link>
      </div>
    </div>
  );
}

// The reader's own unsaved changes to this page: continue them, or drop
// them (with Undo) without opening the editor.
export function DraftNotice({ pageId, editHref, t }: { pageId: string; editHref: string; t: { text: string; continue: string; discard: string; discarded: string; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function discard() {
    start(async () => {
      const result = await discardDraft(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      const kept = result.value;
      toast(kept ? {
        id: `draft-${pageId}`,
        text: t.discarded,
        undo: async () => {
          const back = await keepDraft(pageId, kept);
          if (!back.ok) return format(t.errors[back.error], back.values);
          router.refresh();
          return true;
        },
      } : { id: `draft-${pageId}`, text: t.discarded });
    });
  }
  return (
    <div className="notice mine" role="status">
      <Pen />
      <p>{t.text}</p>
      <div className="row-actions">
        <Link className="button small" href={editHref}>{t.continue}</Link>
        <button type="button" className="button small quiet" disabled={pending} onClick={discard}>{t.discard}</button>
      </div>
    </div>
  );
}

// Asking the page's readers to confirm they read it: everyone who reads
// the space, or some groups.
function AskReadDialog({ open, onClose, page, groups, t }: { open: boolean; onClose: () => void; page: { id: string; title: string }; groups: { id: string; name: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [some, setSome] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    setError(null);
    start(async () => {
      const result = await askRead(page.id, some ? chosen : []);
      if (!result.ok) return setError(format(t.errors[result.error], result.values));
      onClose();
      router.refresh();
      toast({ id: `ask-read-${page.id}`, text: plural(t.reads.asked, result.value.asked, t.locale) });
    });
  }
  return (
    <Dialog open={open} title={t.reads.title} labels={t.dialog} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="where">{format(t.reads.intro, { title: page.title })}</p>
        <fieldset className="plain">
          <legend className="visually-hidden">{t.reads.title}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="read-who" checked={!some} onChange={() => setSome(false)} />{t.reads.everyone}</label>
            {groups.length > 0 && <label className="choice"><input type="radio" name="read-who" checked={some} onChange={() => setSome(true)} /><People />{t.reads.groups}</label>}
          </div>
          {some && (
            <div className="group-list">
              {groups.map(g => (
                <label key={g.id} className="check">
                  <input type="checkbox" checked={chosen.includes(g.id)} onChange={e => setChosen(list => (e.target.checked ? [...list, g.id] : list.filter(x => x !== g.id)))} />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-foot">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={pending || (some && chosen.length === 0)}>{t.reads.submit}</button>
        </div>
      </form>
    </Dialog>
  );
}

// On a page its reader is asked to confirm: read it, then one button.
export function ReadRequest({ pageId, again, t }: { pageId: string; again: boolean; t: { banner: string; bannerAgain: string; confirm: string; confirmed: string; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function confirm() {
    start(async () => {
      const result = await confirmRead(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `read-${pageId}`, text: t.confirmed });
    });
  }
  return (
    <div className="notice ask-read" role="status">
      <Seal />
      <p>{again ? t.bannerAgain : t.banner}</p>
      <button type="button" className="button small" disabled={pending} onClick={confirm}><Check />{t.confirm}</button>
    </div>
  );
}
