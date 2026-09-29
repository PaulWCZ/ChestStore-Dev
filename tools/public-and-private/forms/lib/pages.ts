import type { Member } from "@argentic/chest-sdk/member";
import { notFound } from "next/navigation";
import type { Level } from "./access.ts";
import { AppError } from "./app-error.ts";
import { db } from "./db.ts";
import { open, type Form } from "./forms.ts";

// A form's page: the form, or the page "not found" — a form the member may
// not open does not exist for them.
export async function formOr404(member: Member, id: string, wanted: Level = "viewer"): Promise<{ form: Form; level: Level }> {
  try {
    return await open(db(), member, id, wanted);
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}
