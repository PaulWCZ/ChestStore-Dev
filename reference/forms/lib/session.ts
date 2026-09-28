import { headers } from "next/headers";
import { member } from "../packages/chest-client/src/member.ts";
import type { Member } from "../packages/chest-client/src/member.ts";
import { Forms } from "./forms.ts";
import { localeOf, messagesFor } from "./i18n.ts";
import type { Messages } from "./i18n.ts";
import { PostgresStore } from "./store.ts";

// The service as the pages and actions of this server use it.
export const forms = new Forms(new PostgresStore());

// currentMember is who the Chest asserts for the request being served (the
// Chest-Member header of the team host), or null: on the public host, or
// for anything that did not come through the Chest's front.
export async function currentMember(): Promise<Member | null> {
  return member(new Request("http://tool/", { headers: await headers() }));
}

// words are the interface's words in the language the request's browser
// prefers, among those the tool speaks (lib/i18n.ts).
export async function words(): Promise<Messages> {
  return messagesFor(localeOf((await headers()).get("accept-language")));
}

// The public address of a form, as a member sees it on the team host
// <tool>-chest.<chest>: the public host is <tool>.<chest>. Anything else
// gives the path alone, which the Chest leads to the public host.
const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u;
const parent = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?$/u;
export async function publicAddress(slug: string): Promise<string> {
  const path = "/f/" + slug;
  const tool = process.env["CHEST_TOOL"] ?? "";
  const host = (await headers()).get("x-forwarded-host") ?? "";
  const dot = host.indexOf(".");
  if (!label.test(tool) || dot < 0 || host.slice(0, dot) !== tool + "-chest" || !parent.test(host.slice(dot + 1))) return path;
  return "https://" + tool + host.slice(dot) + path;
}
