import { answerBatches, type Answer } from "../../src/lib/answers.ts";
import type { Query } from "../../src/lib/db.ts";
import { versions } from "../../src/lib/forms.ts";
import type { Definition } from "../../src/shared/model.ts";

// Every answer of a form, newest first, and its versions: what the tests
// read back (the tool itself reads them a few hundred at a time).
export async function everyAnswer(sql: Query, formId: string): Promise<{ answers: Answer[]; versions: Map<number, Definition> }> {
  const list: Answer[] = [];
  for await (const batch of answerBatches(sql, formId)) list.push(...batch);
  return { answers: list, versions: await versions(sql, formId) };
}
