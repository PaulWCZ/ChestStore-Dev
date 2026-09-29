"use client";

import { useToast } from "@argentic/chest-ui/components";
import { format } from "../lib/i18n/format.ts";
import { Copy } from "./icons.tsx";

// Copies a link, says so. A browser that refuses the clipboard: the toast
// shows the link to copy by hand (never the browser's own prompt box).
export function CopyButton({ text, label, done, failed, className = "button quiet small" }: { text: string; label: string; done: string; failed: string; className?: string }) {
  const toast = useToast();
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ id: "copy", text: done });
      } catch {
        toast({ id: "copy", text: format(failed, { link: text }), tone: "error" });
      }
    }}><Copy />{label}</button>
  );
}
