import { useRef, useState } from "react";
import { Check, Copy } from "../components/icons.tsx";

// A link to give someone: shown whole (so it can be read and selected),
// and a button that copies it and says so — in the button and to screen
// readers. Where the browser refuses the clipboard, the link is selected
// for the person to copy it themselves.
export function CopyLink({ url, label, copy, done }: { url: string; label: string; copy: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  return (
    <div className="copy-link">
      <input ref={field} className="field" readOnly value={url} aria-label={label} onFocus={e => e.currentTarget.select()} />
      <button type="button" className="button quiet small" onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          field.current?.focus();
          field.current?.select();
        }
      }}>
        {copied ? <Check /> : <Copy />}<span aria-live="polite">{copied ? done : copy}</span>
      </button>
    </div>
  );
}
