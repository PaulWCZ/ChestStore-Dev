import { useEffect, useState } from "react";
import { Check, Copy } from "../components/icons.tsx";

// Copies the page's own address (the follow-up link) for the customer.
// It shows with the thank-you of a request just sent.
export function CopyLink({ label, done }: { label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  // The thank-you is said once: the address loses ?new=1 (a reload, or the
  // link copied from the bar, shows the request without it).
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ["new", "again", "mailed"]) url.searchParams.delete(key);
    if (url.href !== location.href) history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }, []);
  return (
    <div>
      <button type="button" className="button soft small" onClick={async () => {
        const url = window.location.origin + window.location.pathname;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          window.prompt(label, url);
        }
      }}>
        {copied ? <Check /> : <Copy />}{copied ? done : label}
      </button>
      <span className="visually-hidden" role="status">{copied ? done : ""}</span>
    </div>
  );
}
