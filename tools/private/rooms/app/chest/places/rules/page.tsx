import { can } from "../../../../lib/access.ts";
import { context } from "../../../../lib/context.ts";
import { RulesForm } from "./rules-form.tsx";

// The rules of the office, for admins.
export default async function Rules({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await context(await searchParams);
  if (!c || !can(c.member, "rules.manage")) return null;
  return <RulesForm rules={c.rules} locale={c.locale} t={{ rules: c.t.rules, errors: c.t.errors }} />;
}
