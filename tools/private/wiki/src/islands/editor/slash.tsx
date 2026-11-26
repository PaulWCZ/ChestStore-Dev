import type { Editor as TiptapEditor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import * as I from "../../components/icons.tsx";
import type { Catalogue } from "../../i18n/index.ts";

// The "/" menu: typing "/" at the start of a line (or after a space) lists
// the blocks the toolbar has — headings, lists, a checklist, a note box, a
// table, an image, a link to a page… — the typed letters filter them
// ("/tab" → Table), arrows move, Enter inserts, Escape closes. The "/" and
// the letters go when a block is chosen. It is the toolbar in words: a way
// to find what the icons do.

export type Slash = { from: number; query: string; index: number; x: number; y: number };
export type SlashItem = { key: string; label: string; icon: ReactNode; run: (editor: TiptapEditor) => void };

export function slashItems(t: Catalogue["editor"], actions: { link: () => void; pick: () => void; file: () => void }): SlashItem[] {
  const c = (e: TiptapEditor) => e.chain().focus();
  return [
    { key: "h1", label: t.styles.h1, icon: <I.Heading />, run: e => c(e).setHeading({ level: 1 }).run() },
    { key: "h2", label: t.styles.h2, icon: <I.Heading />, run: e => c(e).setHeading({ level: 2 }).run() },
    { key: "h3", label: t.styles.h3, icon: <I.Heading />, run: e => c(e).setHeading({ level: 3 }).run() },
    { key: "bullets", label: t.bullets, icon: <I.Bullets />, run: e => c(e).toggleBulletList().run() },
    { key: "numbers", label: t.numbers, icon: <I.Numbers />, run: e => c(e).toggleOrderedList().run() },
    { key: "checklist", label: t.checklist, icon: <I.CheckList />, run: e => c(e).toggleTaskList().run() },
    { key: "callout", label: t.callout, icon: <I.Note />, run: e => c(e).toggleCallout().run() },
    { key: "quote", label: t.quote, icon: <I.Quote />, run: e => c(e).toggleBlockquote().run() },
    { key: "table", label: t.table, icon: <I.Table />, run: e => c(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { key: "image", label: t.image, icon: <I.Image />, run: () => actions.file() },
    { key: "pageLink", label: t.pageLink, icon: <I.PageLink />, run: () => actions.pick() },
    { key: "link", label: t.link, icon: <I.Link />, run: () => actions.link() },
    { key: "codeBlock", label: t.codeBlock, icon: <I.Code />, run: e => c(e).toggleCodeBlock().run() },
    { key: "divider", label: t.divider, icon: <I.Divider />, run: e => c(e).setHorizontalRule().run() },
  ];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// The items a query keeps: those whose name holds it (accents aside).
export function matching(items: SlashItem[], query: string): SlashItem[] {
  const q = fold(query.trim());
  return q === "" ? items : items.filter(i => fold(i.label).includes(q));
}

export function SlashMenu({ slash, items, label, empty, onChoose }: { slash: Slash; items: SlashItem[]; label: string; empty: string; onChoose: (item: SlashItem) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // The chosen item stays in sight as the arrows move through a long list.
  useEffect(() => {
    box.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [slash.index, slash.query]);
  // Placed where the "/" was typed, through its element's style (the
  // page's policy refuses a style attribute, not a script setting one).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.left = `${slash.x}px`;
    el.style.top = `${slash.y}px`;
  }, [slash.x, slash.y]);
  // Keyboard users move with the arrows from the page; the list can also
  // be reached and scrolled on its own (it never takes the text's focus by a click).
  return (
    <div ref={box} className="slash" tabIndex={0} onMouseDown={e => e.preventDefault()}>
      {items.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul role="listbox" id="slash-list" aria-label={label}>
          {items.map((item, i) => (
            <li key={item.key} id={`slash-${item.key}`} role="option" aria-selected={i === slash.index}
              onMouseDown={e => { e.preventDefault(); onChoose(item); }}>
              {item.icon}<span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
