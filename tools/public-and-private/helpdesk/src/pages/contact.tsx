import { Island, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
import { format, isLocale, localeOf } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { issue } from "../lib/form-token.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { introFor, rememberPublicOrigin, settings } from "../lib/tickets.ts";
import { words } from "../i18n/index.ts";
import { publicLook } from "../theme.ts";
import { PublicShell } from "./public-shell.tsx";

// The public contact form, /: the company's name, one sentence in the
// visitor's language, the help centre first if the company has one, the
// form. ?embed=1: inside the company's website (a frame it allowed);
// ?lang=: the language the address names (a frame may not keep the
// switch's cookie). A form sent without JavaScript and refused comes back
// with ?error= (said under its field).
export async function contactPage({ locale: visitor, query, request }: PageContext<VisitorContext>): Promise<View> {
  const given = query("lang");
  const locale = isLocale(given) ? given : localeOf(visitor);
  const t = words(locale);
  const embed = query("embed") === "1";
  const sql = db();
  await rememberPublicOrigin(sql, publicOrigin(request.headers));
  const [s, look] = await Promise.all([settings(sql), publicLook()]);
  const company = s.companyName || t.public.teamPlain;
  const error = query("error");
  return {
    title: s.companyName ? format(t.public.titleWith, { company: s.companyName }) : t.public.title,
    locale,
    body: (
      <PublicShell company={company} logo={look.source === "brand" ? look.logo ?? null : null} locale={locale} back={embed ? "/?embed=1" : "/"} t={t} embed={embed} foot={format(t.public.privacy, { company })}>
        <div className="stack">
          <h1>{s.companyName ? format(t.public.titleWith, { company: s.companyName }) : t.public.title}</h1>
          <p className="muted">{introFor(s, locale) || t.public.intro}</p>
          {s.helpUrl && <p><a className="help-link" href={s.helpUrl} target={embed ? "_top" : undefined} rel="noopener">{t.public.help}</a></p>}
        </div>
        {s.formOpen ? (
          <section className="public-card">
            <Island name="ContactForm" props={{ started: issue(), locale, embed, error: error && Object.hasOwn(t.errors, error) ? error : null, t: { public: t.public, errors: t.errors, files: t.kit.files } }} />
          </section>
        ) : <p className="notice">{t.public.closed}</p>}
      </PublicShell>
    ),
  };
}
