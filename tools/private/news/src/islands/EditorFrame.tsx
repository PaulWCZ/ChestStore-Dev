import type { ReactNode } from "react";
import { Bold, Heading, Italic, LinkIcon, List, Numbers, Picture, Quote } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// The editor's frame before the editor runs (./TextEditor.tsx while its
// script loads, ./Tiptap.tsx before its first render): the same toolbar,
// its buttons not yet usable, and the box with its placeholder, at the
// same size — nothing moves when the editor arrives.
type Words = Catalogue["composer"];

export function ToolbarFrame({ t }: { t: Words }) {
  const tool = (label: string, icon: ReactNode) => (
    <button type="button" className="tool" title={label} disabled>
      {icon}<span className="visually-hidden">{label}</span>
    </button>
  );
  return (
    <div className="toolbar" role="toolbar" aria-label={t.toolbar} aria-disabled="true">
      {tool(t.bold, <Bold />)}
      {tool(t.italic, <Italic />)}
      {tool(t.heading, <Heading />)}
      <span className="sep" aria-hidden="true" />
      {tool(t.list, <List />)}
      {tool(t.numbered, <Numbers />)}
      {tool(t.quote, <Quote />)}
      <span className="sep" aria-hidden="true" />
      {tool(t.link, <LinkIcon />)}
      {tool(t.picture, <Picture />)}
    </div>
  );
}

export function EditorFrame({ placeholder, t }: { placeholder: string; t: Words }) {
  return (
    <div className="text-editor">
      <ToolbarFrame t={t} />
      <div className="editor-area">
        <div className="prose editable waiting" aria-hidden="true"><p data-placeholder={placeholder} /></div>
      </div>
    </div>
  );
}
