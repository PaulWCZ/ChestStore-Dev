import { member } from "@argentic/chest-sdk/member";
import { checkToken, isChoice } from "../../../../../lib/answer-links.ts";
import { answerEvent } from "../../../../../lib/answering.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { id } from "../../../../../lib/model.ts";

// "I'm coming" / "Not coming" from an email, in one tap (lib/answer-links.ts).
// The person is whoever the Chest says opened the link; the token proves
// News wrote this button for them and this event. The answer is given,
// then the post opens and says it, with Undo ("answered", "was"). A link
// that is not theirs, or an event already over, changes nothing and the
// post says why. Nothing else can be done at this address.
const back = (path: string) => new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = member(request);
  let postId: string;
  try {
    postId = id((await params).id);
  } catch {
    return new Response(null, { status: 404 });
  }
  const url = new URL(request.url);
  const choice = url.searchParams.get("a");
  const post = `/chest/posts/${postId}`;
  if (!actor || !isChoice(choice) || !(await checkToken(db(), postId, choice, actor.id, url.searchParams.get("t")))) return back(`${post}?answered=invalid`);
  try {
    const done = await answerEvent(db(), actor, postId, choice);
    return back(`${post}?answered=${done.answer ?? "none"}&was=${done.before ?? "none"}`);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === "not_found") return new Response(null, { status: 404 });
    if (error.code === "closed") return back(`${post}?answered=closed`);
    return back(`${post}?answered=invalid`);
  }
}
