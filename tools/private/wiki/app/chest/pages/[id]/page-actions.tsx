"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Calendar, Check, Clock, Dots, Download, Eye, Move, Pen, Plus, Printer, Stamp, Trash } from "../../../../components/icons.tsx";
import { Menu } from "../../../../components/menu.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "../../../../components/new-page.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import { deletePage, markReviewed, movePage, restorePage, setReview, setTemplate, setWatching } from "../../actions.ts";

export type TemplateWords = { tag: string; mark: string; unmark: string; marked: string; unmarked: string };
type Words = NewPageWords & { page: Catalogue["page"]; move: Catalogue["move"]; shell: Catalogue["shell"]; watch: Catalogue["watch"]; review: Omit<Catalogue["review"], "due">; marks: TemplateWords; spaceName: string; locale: string };
// What the page's reader has set on it: watching, a template, a reminder.
export type PageState = { watching: boolean; template: boolean; review: { months: number | null; ownerName: string | null; mine: boolean } };
const reviewChoices = [3, 6, 12] as const;
export type MovePlace = { spaces: { id: string; name: string }[]; nodes: { id: string; spaceId: string; parentId: string | null; title: string }[] };

// The actions of a page: "Edit" first (editors), then a menu for the rest —
// a page inside, move, history, print, download, delete (with undo).
export function PageActions({ page, writer, editHref, t, places, state }: { page: { id: string; title: string; spaceId: string; parentId: string | null; hasChildren: boolean }; writer: boolean; editHref: string; t: Words; places?: MovePlace; state: PageState }) {
  const router = useRouter();
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
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
        return toast(format(t.errors[result.error], result.values));
      }
      toast(next ? t.watch.on : t.watch.off);
    });
  }

  function template() {
    const next = !state.template;
    start(async () => {
      const result = await setTemplate(page.id, next);
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      router.refresh();
      toast(format(next ? t.marks.marked : t.marks.unmarked, { title: page.title, space: t.spaceName }));
    });
  }

  function remove() {
    start(async () => {
      const result = await deletePage(page.id);
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      const below = result.value.pages - 1;
      const text = below > 0 ? plural(t.page.deletedWith, below, t.locale, { title: page.title }) : format(t.page.deleted, { title: page.title });
      router.push(page.parentId ? `/chest/pages/${page.parentId}` : `/chest/spaces/${page.spaceId}`);
      toast(text, { label: t.page.undo, run: async () => {
        const back = await restorePage(page.id);
        if (!back.ok) return toast(format(t.errors[back.error], back.values));
        router.push(`/chest/pages/${page.id}`);
        toast(t.page.restored);
      } });
    });
  }

  return (
    <div className="actions">
      <button type="button" className="button quiet watch" aria-pressed={watching} title={t.watch.hint} onClick={watch}>
        {watching ? <Check /> : <Eye />}<span className="label">{watching ? t.watch.watching : t.watch.watch}</span>
      </button>
      {writer && <Link className="button" href={editHref}><Pen />{t.page.edit}</Link>}
      <Menu label={t.page.more} icon={<Dots />}>
        {writer && <button type="button" onClick={() => setChild({ spaceId: page.spaceId, spaceName: t.spaceName, parentId: page.id, parentTitle: page.title })}><Plus />{t.shell.newSubpage}</button>}
        {writer && places && <button type="button" onClick={() => setMoving(true)}><Move />{t.page.move}</button>}
        {writer && <button type="button" disabled={pending} onClick={template}><Stamp />{state.template ? t.marks.unmark : t.marks.mark}</button>}
        {writer && <button type="button" onClick={() => setReviewing(true)}><Calendar />{state.review.months ? format(t.review.menuSet, { months: state.review.months }) : t.review.menu}</button>}
        <Link href={`/chest/pages/${page.id}/history`}><Clock />{t.page.history}</Link>
        <button type="button" onClick={() => window.print()}><Printer />{t.page.print}</button>
        <a href={`/chest/pages/${page.id}/export?format=md`} download><Download />{t.page.exportMarkdown}</a>
        <a href={`/chest/pages/${page.id}/export?format=html`} download><Download />{t.page.exportHtml}</a>
        {page.hasChildren && <a href={`/chest/pages/${page.id}/export?format=zip`} download><Download />{t.page.exportZip}</a>}
        {writer && <button type="button" className="danger" disabled={pending} onClick={remove}><Trash />{t.page.delete}</button>}
      </Menu>
      {places && <MoveDialog open={moving} onClose={() => setMoving(false)} page={page} places={places} t={t} />}
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
      toast(t.shell.moved);
    });
  }
  return (
    <Dialog open={open} title={format(t.move.title, { title: page.title })} closeLabel={t.common.close} onClose={onClose}>
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
              <label key={n.id} className="choice" style={{ marginInlineStart: n.depth * 18 }}>
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
      toast(months ? format(t.review.set, { months }) : t.review.cleared);
    });
  }
  return (
    <Dialog open={open} title={t.review.title} closeLabel={t.common.close} onClose={onClose}>
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
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      router.refresh();
      toast(format(t.done, { months }));
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
