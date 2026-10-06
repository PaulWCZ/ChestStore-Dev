import { lazy, Suspense, useEffect, useState } from "react";
import type { EditorProps } from "./Tiptap.tsx";

// The text of a post, formatted as it will read (./Tiptap.tsx). The editor
// is a script of its own, fetched once the composer runs in the browser:
// the server renders its frame (the same size, so nothing moves), the
// other pages never load it, and the server never holds it in memory.
const Tiptap = lazy(() => import("./Tiptap.tsx"));

export function TextEditor(props: EditorProps) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  const frame = <div className="text-editor"><div className="editor-area"><div className="prose editable" aria-hidden="true" /></div></div>;
  return inBrowser ? <Suspense fallback={frame}><Tiptap {...props} /></Suspense> : frame;
}
