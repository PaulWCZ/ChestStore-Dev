import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Sql } from "./db.ts";
import { link } from "./mailer.ts";

// "I'm coming" / "Not coming" in one tap from an email. The link opens
// News through the Chest's front like any page, so who answers is still
// who the Chest says (member(request)); a stranger's link does nothing.
// The token in the link only proves which button, for which person and
// event, News itself wrote: a page elsewhere cannot make someone answer by
// making their browser open /chest/posts/4/answer?a=yes (that address,
// without the right token for that person, changes nothing). It is not
// single-use on purpose: the same button twice gives the same answer.
//
// The key is News's own, made once at random and kept in its database
// (chest_state, "answer_key"); it never leaves it.

export type Choice = "yes" | "no";
export const isChoice = (value: unknown): value is Choice => value === "yes" || value === "no";

async function answerKey(sql: Sql): Promise<Buffer> {
  await sql`insert into chest_state (key, value) values ('answer_key', ${randomBytes(32).toString("hex")}) on conflict (key) do nothing`;
  const [row] = await sql<{ value: string }[]>`select value from chest_state where key = 'answer_key'`;
  return Buffer.from(row!.value, "hex");
}

const sign = (key: Buffer, postId: string, choice: Choice, memberId: string): string =>
  createHmac("sha256", key).update(`answer:${postId}:${choice}:${memberId}`).digest("base64url").slice(0, 32);

// answerToken is the token of one button, for one person and event.
export async function answerToken(sql: Sql, postId: string, choice: Choice, memberId: string): Promise<string> {
  return sign(await answerKey(sql), postId, choice, memberId);
}

// checkToken says whether a token is the one News wrote for this button,
// person and event.
export async function checkToken(sql: Sql, postId: string, choice: Choice, memberId: string, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/u.test(token)) return false;
  const expected = Buffer.from(sign(await answerKey(sql), postId, choice, memberId));
  return timingSafeEqual(expected, Buffer.from(token));
}

// answerPath is the page a button opens (relative to the team host).
export const answerPath = (postId: string, choice: Choice, token: string) => `/chest/posts/${postId}/answer?a=${choice}&t=${token}`;

// answerLinker reads the key once, then writes both buttons as addresses
// outside the Chest for any person and event (in a letter written for each
// person); null when the Chest does not give the tool's address (the email
// then says to open News).
export type Links = { yes: string; no: string } | null;
export async function answerLinker(sql: Sql): Promise<(postId: string, memberId: string) => Links> {
  const key = await answerKey(sql);
  return (postId, memberId) => {
    const yes = link(answerPath(postId, "yes", sign(key, postId, "yes", memberId)));
    const no = link(answerPath(postId, "no", sign(key, postId, "no", memberId)));
    return yes && no ? { yes, no } : null;
  };
}

// A letter's lines asking whether the person comes, with both links.
export function answerLines(t: { mail: { answerQuestion: string; answerYes: string; answerNo: string } }, links: Links, format: (text: string, values: Record<string, string>) => string): string[] {
  if (!links) return [];
  return [t.mail.answerQuestion, format(t.mail.answerYes, { link: links.yes }), format(t.mail.answerNo, { link: links.no }), ""];
}
