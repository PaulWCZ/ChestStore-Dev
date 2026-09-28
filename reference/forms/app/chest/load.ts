import { notFound } from "next/navigation";
import { FormsError } from "../../lib/model.ts";
import type { Form } from "../../lib/model.ts";
import { currentMember, forms } from "../../lib/session.ts";

// loadForm is the form a page of the members' part is about, for the member
// asking; an unknown one is the page not found.
export async function loadForm(id: string): Promise<Form> {
  try {
    return await forms.get(await currentMember(), id);
  } catch (error) {
    if (error instanceof FormsError && error.code === "not_found") notFound();
    throw error;
  }
}
