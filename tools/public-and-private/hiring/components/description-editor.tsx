"use client";

import { useEffect, useRef, useState } from "react";
import { fromEditor, toHtml, type EditorNode } from "../lib/rich-text.ts";
import { Bold, Heading, List } from "./icons.tsx";

type Words = { heading: string; bold: string; list: string; placeholder: string; tooLong: string };

// The job's description in a real editor: what is written looks as it will
// on the careers page — a heading, bold words, a list — and nobody types a
// mark. Three buttons with their words (and Ctrl/⌘+B). What it holds is
// read back into the tool's marks (lib/rich-text.ts): the page never keeps
// or renders the editor's HTML, and a paste brings its text only.
export function DescriptionEditor({ id, labelledBy, describedBy, value, max, onChange, t }: { id: string; labelledBy: string; describedBy?: string; value: string; max: number; onChange: (value: string) => void; t: Words }) {
  const box = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(value.trim() === "");
  const [length, setLength] = useState(value.length);
  const tooLong = length > max;

  // The starting content, once: afterwards the browser owns the editing.
  useEffect(() => {
    if (box.current) box.current.innerHTML = toHtml(value);
    // A new line is a paragraph (not the browser's bare <div>).
    document.execCommand("defaultParagraphSeparator", false, "p");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const read = () => {
    const el = box.current;
    if (!el) return;
    const source = fromEditor(el as unknown as EditorNode);
    setEmpty(source.trim() === "" && (el.textContent ?? "").trim() === "");
    setLength(source.length);
    onChange(source);
  };
  // The browser's own editing commands, on the selection.
  const run = (command: string, arg?: string) => {
    // Focusing an editor that has it would move the caret to its start.
    if (document.activeElement !== box.current) box.current?.focus();
    document.execCommand(command, false, arg);
    read();
  };
  const inBlock = (tag: string) => {
    const node = document.getSelection()?.anchorNode ?? null;
    for (let n: Node | null = node; n && n !== box.current; n = n.parentNode) if (n.nodeName === tag) return true;
    return false;
  };
  return (
    <div className="editor">
      <div className="toolbar" role="toolbar" aria-controls={id} aria-label={t.heading + ", " + t.bold + ", " + t.list}>
        <button type="button" className="tool" onMouseDown={e => e.preventDefault()} onClick={() => run("formatBlock", inBlock("H3") ? "P" : "H3")}><Heading />{t.heading}</button>
        <button type="button" className="tool" onMouseDown={e => e.preventDefault()} onClick={() => run("bold")}><Bold />{t.bold}</button>
        <button type="button" className="tool" onMouseDown={e => e.preventDefault()} onClick={() => run("insertUnorderedList")}><List />{t.list}</button>
      </div>
      <div
        ref={box}
        id={id}
        className={`editor-area rich${empty ? " is-empty" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={tooLong || undefined}
        data-placeholder={t.placeholder}
        onInput={read}
        onBlur={read}
        onPaste={e => {
          // Text only: another page's styles and links never come in.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          read();
        }}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            run("bold");
          }
        }}
      />
      {tooLong && <p className="error" role="alert">{t.tooLong}</p>}
    </div>
  );
}
