"use client";

import { Copy } from "./icons.tsx";
import { useToast } from "./toast.tsx";

// Copies a link, says so.
export function CopyButton({ text, label, done, className = "button quiet small" }: { text: string; label: string; done: string; className?: string }) {
  const toast = useToast();
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast(done);
      } catch {
        window.prompt(label, text);
      }
    }}><Copy />{label}</button>
  );
}
