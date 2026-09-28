import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { plural } from "../../../../lib/i18n/index.ts";
import { viewer } from "../../../../lib/session.ts";
import { template, templateKeys } from "../../../../lib/templates.ts";
import { Picker, type Choice } from "./picker.tsx";

// Start a form: blank, or one of the templates, in the member's language.
export default async function NewForm() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  if (!can(member, "forms.create")) {
    return <div className="narrow"><a className="back-link" href="/chest"><Back />{t.create.back}</a><div className="empty"><p>{t.home.noCreate}</p></div></div>;
  }
  const choices: Choice[] = templateKeys.map(key => {
    const { definition, settings } = template(key, t);
    const questions = definition.pages.flatMap(p => p.questions);
    return {
      key,
      name: t.templates[key].name,
      blurb: t.templates[key].blurb,
      kinds: questions.slice(0, 6).map(q => q.kind),
      count: key === "blank" ? "" : plural(t.create.questions, questions.length, locale),
      accent: settings.accent ?? "berry",
    };
  });
  return (
    <div className="narrow wide">
      <a className="back-link" href="/chest"><Back />{t.create.back}</a>
      <h1 className="page-title">{t.create.title}</h1>
      <p className="lede">{t.create.lede}</p>
      <Picker choices={choices} creating={t.create.creating} errors={t.errors} />
    </div>
  );
}
