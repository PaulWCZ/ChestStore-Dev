import { toast } from "@argentic/chest-app/client";
import { format } from "../shared/format.ts";
import { Copy } from "./icons.tsx";

// Copies a link, says so; when the browser refuses, the toast shows the
// link to copy by hand (never the browser's own prompt).
export function CopyButton({ text, label, done, failed, className = "button quiet small" }: { text: string; label: string; done: string; failed: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ id: `copy-${text}`, text: done });
      } catch {
        toast({ id: `copy-${text}`, text: format(failed, { link: text }), tone: "error" });
      }
    }}><Copy />{label}</button>
  );
}
