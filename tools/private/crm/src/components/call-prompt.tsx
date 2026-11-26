import { call, toast } from "@argentic/chest-app/client";
import { useEffect, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { Close, Phone } from "./icons.tsx";
import type { Words } from "./shared.ts";

// "Log this call?" — between meetings, a salesperson taps "Call" on a
// contact's (or a company's) page, talks, comes back to the tab: the page
// asks, once, whether to log the call, with a line for what was said. The
// tap is remembered in this tab only (sessionStorage: nothing leaves the
// browser, nothing is logged unless they say so); "Not now" forgets it; it
// is forgotten after three hours too.
const storageKey = "crm:call";
const maxAge = 3 * 3600_000;

type Tapped = { path: string; at: number };

function read(): Tapped | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Tapped | null;
    return value && typeof value.path === "string" && typeof value.at === "number" ? value : null;
  } catch {
    return null;
  }
}
function forget(): void {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // A browser that keeps nothing: nothing to forget.
  }
}

export function CallPrompt({ on, name, t }: { on: { contact?: string; company?: string; deal?: string }; name: string; t: Words<"log" | "timeline"> }) {
  const [asking, setAsking] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
    useEffect(() => {
    const path = window.location.pathname;
    // A tap on any "tel:" link of this page is remembered…
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href^='tel:']");
      if (!link) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ path, at: Date.now() } satisfies Tapped));
      } catch {
        // Private browsing that refuses storage: no prompt, nothing lost.
      }
    };
    // …and asked about when the person comes back to the page.
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const tapped = read();
      if (!tapped) return;
      if (Date.now() - tapped.at > maxAge) return forget();
      // A few seconds is a slip of the finger, not a call.
      if (tapped.path === path && Date.now() - tapped.at > 5_000) setAsking(true);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  if (!asking) return null;
  const dismiss = () => { forget(); setAsking(false); };
  return (
    <section className="call-prompt" role="region" aria-labelledby="call-prompt-title">
      <p id="call-prompt-title" className="call-prompt-title"><Phone />{format(t.log.callPrompt, { name })}</p>
      <label className="visually-hidden" htmlFor="call-prompt-body">{t.log.what}</label>
      <input id="call-prompt-body" className="field" value={body} onChange={e => setBody(e.target.value)} maxLength={5000} placeholder={t.log.callPromptPlaceholder} autoComplete="off" />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="button small" disabled={pending} onClick={() => start(async () => {
          const r = await call("logActivity", { ...on, kind: "call", body }, { quiet: true });
          if (!r.ok) return setError(r.message);
          dismiss();
          setBody("");
          toast({
            id: `log-${r.value.id}`,
            text: format(t.log.logged, { kind: t.timeline.kinds.call }),
            undo: async () => {
              const back = await call("removeActivity", { id: r.value.id }, { quiet: true });
              return back.ok ? true : back.message;
            },
          });
        })}><Phone />{t.log.callPromptLog}</button>
        <button type="button" className="button small quiet" onClick={dismiss}><Close />{t.log.callPromptSkip}</button>
      </div>
    </section>
  );
}
