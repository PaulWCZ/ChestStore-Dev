// A public form's token and its honeypot, shared by the server (pages, the
// actions) and the browser (an island's form, call()).

// The token of the page being rendered (renderToString is synchronous: one
// page at a time), set by the server for a public page; in the browser,
// the page's <meta name="chest-form">, which each answer renews.
let rendering = "";
export function setRenderingForm(token: string): void {
  rendering = token;
}
export function currentForm(): string {
  if (typeof document !== "undefined") return document.querySelector<HTMLMetaElement>('meta[name="chest-form"]')?.content ?? "";
  return rendering;
}

// <Honeypot />, in every public form of a bounded action: the field people
// never see ("website") — a robot that fills it is answered "done" and
// nothing is done — and the form's token (chest_form), which the action
// requires. In a page or in an island.
export function Honeypot() {
  return (
    <div hidden>
      <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      <input type="hidden" name="chest_form" defaultValue={currentForm()} />
    </div>
  );
}
