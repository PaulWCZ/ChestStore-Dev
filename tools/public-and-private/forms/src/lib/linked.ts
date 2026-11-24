import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Query } from "./db.ts";
import type { Start } from "./forms.ts";
import { guessRoutes } from "./routes.ts";
import { getSetting, putSetting } from "./settings.ts";
import type { Template } from "./templates.ts";

// The tools that receive Forms' answers: Clients (`crm`, a contact) and
// Support (`helpdesk`, a ticket). Installed is not enough: the owner of the
// Chest approves each link (SDK 0.7.0: "Forms → Support: An answer asks
// for help"), and until then every contact would be told to nobody. 0.7.0
// names no receiver (events.emit answers how many tools an event was
// written for), so Settings says what Forms knows:
// - not_installed: the Chest lists its tools (Proposal (studio):
//   chest.tools, CHEST_TOOL_URLS) and that one is not among them;
// - not_linked: the last answer of that kind reached no tool (kept by
//   routed(), lib/answered.ts) — ask the owner to approve the link;
// - linked: otherwise (it reached one, or nothing was sent yet).
export const receivers = { contact: "crm", request: "helpdesk" } as const;
export const reachKeys = { "forms.contact": "reach_contact", "forms.request": "reach_request" } as const;
const types = { contact: "forms.contact", request: "forms.request" } as const;
export type LinkState = "linked" | "not_linked" | "not_installed";
export type Links = { contact: LinkState; request: LinkState };

// Whether the Chest says which tools it has (the proposal's variable):
// without it, "not installed" is never said — the tool cannot know.
const listed = () => typeof process.env["CHEST_TOOL_URLS"] === "string" && process.env["CHEST_TOOL_URLS"] !== "";

export function installed(): { contact: boolean; request: boolean } {
  const has = (name: string) => !listed() || chest.tools.get(name) !== null;
  return { contact: has(receivers.contact), request: has(receivers.request) };
}

// reached keeps whether the last event of a kind reached a tool.
export async function reached(sql: Query, type: keyof typeof reachKeys, any: boolean): Promise<void> {
  if ((await getSetting<boolean>(sql, reachKeys[type])) !== any) await putSetting(sql, reachKeys[type], any);
}

// linkOf, when a page is drawn (never cached: the owner's approval shows
// at the next answer).
export async function linkOf(sql: Query, kind: keyof typeof receivers): Promise<LinkState> {
  if (!installed()[kind]) return "not_installed";
  return (await getSetting<boolean>(sql, reachKeys[types[kind]])) === false ? "not_linked" : "linked";
}

// Whether the Chest would send email now (mail.available, studio.16),
// asked before a page promises one: "off" (a Chest without mail),
// "not_connected" (the owner has not connected the company's email),
// "paused", "quota" (the day's emails are used). When the Chest does not
// answer, what the last copy taught (lib/respond.ts keeps mail_works), or
// "unknown".
export type MailState = "ready" | "off" | "not_connected" | "paused" | "quota" | "unknown";
export async function mailState(sql: Query): Promise<MailState> {
  try {
    const state = await mail.available();
    if (state.ok) return "ready";
    return state.reason === "not_connected" ? "not_connected" : state.reason === "quota" ? "quota" : state.reason === "not_granted" ? "off" : "paused";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    const known = (await getSetting<boolean>(sql, "mail_works")) ?? null;
    return known === null ? "unknown" : known ? "ready" : "off";
  }
}

export async function links(sql: Query): Promise<Links> {
  const [contact, request] = await Promise.all([linkOf(sql, "contact"), linkOf(sql, "request")]);
  return { contact, request };
}

// startOf: what a template's new form starts with — its links to the
// other tools already mapped (guessRoutes) and on when the receiving tool
// is linked.
export async function startOf(sql: Query, made: Template): Promise<Start> {
  const on = await links(sql);
  const guess = guessRoutes(made.definition);
  return {
    definition: made.definition,
    settings: made.settings,
    routes: {
      contact: made.links?.contact && on.contact === "linked" && (guess.contact.email || guess.contact.phone) ? guess.contact : null,
      request: made.links?.request && on.request === "linked" ? guess.request : null,
    },
  };
}
