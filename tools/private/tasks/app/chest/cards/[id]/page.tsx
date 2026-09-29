import { notFound, redirect } from "next/navigation";
import { whereIs } from "../../../../lib/cards.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { viewer } from "../../../../lib/session.ts";

// A card's address by its id: bell items, emails and calendar events point
// here, and it opens the card on the board it is on now — a card moved to
// another board since is still found. A card gone, or on a board the
// member does not see, is "Nothing here" (a private board does not leak).
export default async function CardAddress({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { id } = await params;
  let boardId: string;
  try {
    boardId = await whereIs(db(), v.member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  redirect(`/chest/boards/${boardId}?card=${encodeURIComponent(id)}`);
}
