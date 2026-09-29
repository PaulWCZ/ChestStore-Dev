import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { asker } from "../../../../../lib/http.ts";
import { vehicleProofObject } from "../../../../../lib/settings.ts";

// Opens a vehicle's registration certificate for its owner and the
// accountants: a fresh 15-minute link signed by the Chest.
export async function GET(request: Request, { params }: { params: Promise<{ member: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return new Response(null, { status: 401 });
  try {
    const { member } = await params;
    const proof = await vehicleProofObject(db(), who.actor, member);
    const { url } = await files.url(proof.object);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
