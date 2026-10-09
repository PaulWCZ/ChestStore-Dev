import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ToolbarFrame } from "./EditorFrame.tsx";
import { Bold, Heading, Italic, LinkIcon, List, Numbers, Picture, Quote } from "../components/icons.tsx";
import { fromDoc, pictureSrc, toDoc, type DocNode } from "../shared/editor-doc.ts";
import type { Catalogue } from "../i18n/index.ts";
import { isSafeHref } from "../shared/markdown.ts";

// The text of a post, formatted as it will read: bold, italic, subheadings,
// lists, quotes, links and pictures, from a toolbar (or Ctrl+B, Ctrl+I…) —
// nobody types marks. News keeps it as plain text with a few marks
// (src/shared/editor-doc.ts): the editor holds only what that text can
// say. Loaded in the browser only, when the composer opens
// (./TextEditor.tsx): the server never loads the editor.
type Words = Catalogue["composer"];
export type EditorProps = {
  id: string;
  value: string;
  onChange: (text: string) => void;
  // Uploads a picture chosen or pasted; null when it did not arrive.
  onPicture: (file: File) => Promise<{ id: string; name: string } | null>;
  placeholder: string;
  describedBy?: string;
  t: Words;
};

export default function Tiptap({ id, value, onChange, onPicture, placeholder, describedBy, t }: EditorProps) {
  const changed = useRef(onChange);
  changed.current = onChange;
  const picture = useRef(onPicture);
  picture.current = onPicture;
  const last = useRef(value);
  const fileInput = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  async function addPictures(files: File[]) {
    for (const f of files) {
      const saved = await picture.current(f);
      if (saved) editorRef.current?.chain().focus().setImage({ src: pictureSrc(saved.id), alt: saved.name.replace(/\.[a-z0-9]{1,5}$/iu, "") }).run();
    }
  }
  const pictures = useRef(addPictures);
  pictures.current = addPictures;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", isAllowedUri: url => isSafeHref(url), HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: toDoc(value) as object,
    immediatelyRender: false,
    // The page's policy allows no style element: the editor's base styles
    // are in src/styles.css.
    injectCSS: false,
    editorProps: {
      attributes: { id, class: "prose editable", role: "textbox", "aria-multiline": "true", "aria-label": t.body, ...(describedBy ? { "aria-describedby": describedBy } : {}) },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        void pictures.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter(f => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        void pictures.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = fromDoc(e.getJSON() as DocNode);
      last.current = text;
      changed.current(text);
    },
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);
  // A text changed from outside (a draft brought back, "Start over").
  useEffect(() => {
    if (editor && value !== last.current) {
      last.current = value;
      editor.commands.setContent(toDoc(value) as object, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="text-editor">
      {editor ? <Toolbar editor={editor} t={t} onLink={() => setLinking(true)} onPicture={() => fileInput.current?.click()} /> : <ToolbarFrame t={t} />}
      {editor && linking && <LinkForm editor={editor} t={t} onClose={() => setLinking(false)} />}
      {editor ? <EditorContent editor={editor} className="editor-area" /> : <div className="editor-area"><div className="prose editable waiting" aria-hidden="true"><p data-placeholder={placeholder} /></div></div>}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ""; void addPictures(list); }} />
    </div>
  );
}

function Toolbar({ editor, t, onLink, onPicture }: { editor: Editor; t: Words; onLink: () => void; onPicture: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      heading: e.isActive("heading"),
      bullets: e.isActive("bulletList"),
      numbers: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
    }),
  });
  const c = () => editor.chain().focus();
  const tool = (label: string, icon: ReactNode, run: () => void, pressed?: boolean) => (
    <button type="button" className="tool" title={label} aria-pressed={pressed} onMouseDown={e => e.preventDefault()} onClick={run}>
      {icon}<span className="visually-hidden">{label}</span>
    </button>
  );
  return (
    <div className="toolbar" role="toolbar" aria-label={t.toolbar}>
      {tool(t.bold, <Bold />, () => c().toggleBold().run(), s.bold)}
      {tool(t.italic, <Italic />, () => c().toggleItalic().run(), s.italic)}
      {tool(t.heading, <Heading />, () => c().toggleHeading({ level: 2 }).run(), s.heading)}
      <span className="sep" aria-hidden="true" />
      {tool(t.list, <List />, () => c().toggleBulletList().run(), s.bullets)}
      {tool(t.numbered, <Numbers />, () => c().toggleOrderedList().run(), s.numbers)}
      {tool(t.quote, <Quote />, () => c().toggleBlockquote().run(), s.quote)}
      <span className="sep" aria-hidden="true" />
      {tool(t.link, <LinkIcon />, onLink, s.link)}
      {tool(t.picture, <Picture />, onPicture)}
    </div>
  );
}

// A link: on the words selected, or the address itself when none is.
function LinkForm({ editor, t, onClose }: { editor: Editor; t: Words; onClose: () => void }) {
  const [value, setValue] = useState(() => String(editor.getAttributes("link")["href"] ?? ""));
  const [error, setError] = useState(false);
  function apply() {
    let href = value.trim();
    if (href && !/^[a-z]+:/iu.test(href)) href = (href.includes("@") && !href.includes("/") ? "mailto:" : "https://") + href;
    if (!isSafeHref(href)) return setError(true);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else chain.setLink({ href }).run();
    onClose();
  }
  return (
    <form className="link-form" onSubmit={e => { e.preventDefault(); apply(); }} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); onClose(); editor.commands.focus(); } }}>
      <label htmlFor="link-href">{t.linkAddress}</label>
      <input id="link-href" className="field" value={value} onChange={e => { setValue(e.target.value); setError(false); }} placeholder={t.linkPlaceholder} inputMode="url" autoFocus aria-invalid={error || undefined} aria-describedby={error ? "link-error" : undefined} />
      <button type="submit" className="button small">{t.linkApply}</button>
      {editor.isActive("link") && <button type="button" className="button quiet small" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>{t.linkRemove}</button>}
      <button type="button" className="button quiet small" onClick={() => { onClose(); editor.commands.focus(); }}>{t.cancel}</button>
      {error && <p id="link-error" className="error" role="alert">{t.linkInvalid}</p>}
    </form>
  );
}
