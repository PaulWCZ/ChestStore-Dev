import type { Answer } from "./answers.ts";
import type { Form } from "./forms.ts";
import { formatDate, type Catalogue } from "./i18n/index.ts";
import { answerText } from "./logic.ts";
import type { Definition } from "./model.ts";
import { nameOf, type Person } from "./people.ts";
import { columnsOf, optionLabels } from "./summary.ts";

// The rows of a form's CSV: one line per answer, one column per question
// ever asked (the latest wording; removed questions marked), numbers as
// numbers, choices by their labels. An anonymous form's export has no one
// in it, and only the month.
export function exportRows(input: { form: Form; answers: Answer[]; versions: Map<number, Definition>; t: Catalogue; locale: "en" | "fr"; zone: string; names: Map<string, Person> }): unknown[][] {
  const { form, answers, versions, t, locale, zone, names } = input;
  const columns = columnsOf(versions, form.draft);
  const labels = optionLabels(versions);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const header: unknown[] = [form.anonymous ? t.csv.month : t.csv.when, ...(form.anonymous ? [] : [t.csv.who]), ...columns.map(c => (c.removed ? `${c.question.title} (${t.answers.removedQuestion})` : c.question.title)), t.csv.version];
  const rows = answers.map(a => {
    const when = a.createdAt ? formatDate(a.createdAt, locale, zone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : a.month.slice(0, 7);
    const who = a.respondent ? nameOf(names.get(a.respondent), locale) : (a.email ?? t.csv.visitor);
    const cells = columns.map(c => {
      const v = a.data[c.question.id];
      if (typeof v === "number") return v;
      const q = { ...c.question, options: (c.question.options ?? []).map(o => ({ ...o, label: labels.get(o.id) ?? o.label })) };
      return answerText(q, v, words);
    });
    return [when, ...(form.anonymous ? [] : [who]), ...cells, a.version];
  });
  return [header, ...rows];
}
