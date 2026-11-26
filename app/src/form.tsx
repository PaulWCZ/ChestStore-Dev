// A public form's token and its honeypot, shared by the server (pages, the
// actions) and the browser (an island's form, call()).

// A token serves one action (bound when it is made: a token taken from a
// page cannot be spent on another action). On the server, the page being
// rendered (renderToString is synchronous: one page at a time) issues one
// per action it shows a form for; in the browser, the token is the one
// the page carries in that form, which each answer renews.
let issue: ((action: string) => string) | null = null;
const issued = new Map<string, string>();
// What a form that asks a proof of work says to a browser without
// JavaScript (the page's words: errors.needs_javascript).
let noScript = "";
export function startForms(issuer: ((action: string) => string) | null, needsJavaScript = ""): void {
  issue = issuer;
  noScript = needsJavaScript;
  issued.clear();
}
const selector = (action: string) => `input[data-chest-form][data-action="${action}"]`;
export function currentForm(action: string): string {
  if (typeof document !== "undefined") return document.querySelector<HTMLInputElement>(selector(action))?.value ?? "";
  if (!issue) return "";
  if (!issued.has(action)) issued.set(action, issue(action));
  return issued.get(action)!;
}
// The next token of an action (an answer brings it): every form of it on
// the page takes it.
export function renewForm(action: string, token: string): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(selector(action))) {
    input.value = token;
    input.defaultValue = token;
  }
}

// <Honeypot action="bookTime" />, in every public form of a bounded
// action: the field people never see ("website") — a robot that fills it
// is answered "done" and nothing is done — and the form's token
// (chest_form) for that action, which it requires. In a page or in an
// island; call() of an island sends the token of a Honeypot of the page.
// An action that asks a proof of work (bound.work): a <noscript> line says
// the form needs JavaScript (the browser never renders its inside).
export function Honeypot({ action }: { action: string }) {
  const token = currentForm(action);
  const work = Number(token.split(".")[3] ?? 0) > 0;
  return (
    <>
      <div hidden>
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
        <input type="hidden" name="chest_form" data-chest-form="" data-action={action} defaultValue={token} />
      </div>
      {work && <noscript><p className="ck-error" role="alert">{typeof document === "undefined" ? noScript : ""}</p></noscript>}
    </>
  );
}

// <FormToken action="visitorUpload" />: a token for an action an island
// calls (call()) with no form of its own on the page — not sent with any
// form (no name), found by call().
export function FormToken({ action }: { action: string }) {
  return <input type="hidden" data-chest-form="" data-action={action} defaultValue={currentForm(action)} />;
}
