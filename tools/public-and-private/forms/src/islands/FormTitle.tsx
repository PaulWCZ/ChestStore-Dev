import { useEffect, useState } from "react";

// The form's name in its header: it follows the title as the builder types
// it (the builder tells it, "forms:title").
export function FormTitle({ initial, untitled }: { initial: string; untitled: string }) {
  const [title, setTitle] = useState(initial);
  useEffect(() => setTitle(initial), [initial]);
  useEffect(() => {
    const follow = (e: Event) => setTitle(String((e as CustomEvent<string>).detail ?? ""));
    addEventListener("forms:title", follow);
    return () => removeEventListener("forms:title", follow);
  }, []);
  return <h1>{title.trim() || untitled}</h1>;
}
