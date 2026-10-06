import { lazy, Suspense, useEffect, useState } from "react";
import { EditorFrame } from "./EditorFrame.tsx";
import type { EditorProps } from "./Tiptap.tsx";

// The text of a post, formatted as it will read (./Tiptap.tsx). The editor
// is a script of its own, fetched once the composer runs in the browser:
// the server renders its frame (the toolbar and the box, the same size,
// so nothing moves), the other pages never load it, and the server never
// holds it in memory.
const Tiptap = lazy(() => import("./Tiptap.tsx"));

export function TextEditor(props: EditorProps) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  const frame = <EditorFrame placeholder={props.placeholder} t={props.t} />;
  return inBrowser ? <Suspense fallback={frame}><Tiptap {...props} /></Suspense> : frame;
}
