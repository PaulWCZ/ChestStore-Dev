"use client";

import { useState } from "react";
import { Check, Copy } from "./icons.tsx";

// Copies a text (a link) and says so, in the button and to screen readers.
export function CopyButton({ text, label, done, className = "button quiet small" }: { text: string; label: string; done: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        window.prompt(label, text);
      }
    }}>
      {copied ? <Check /> : <Copy />}<span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}
