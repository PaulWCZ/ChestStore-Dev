import { useState } from "react";
import { Check, Copy } from "../components/icons.tsx";

// Copies the page's own address (the follow-up link) for the customer.
export function CopyLink({ label, done }: { label: string; done: string }) {
  const [copied, setCopied] = useState(false);
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
