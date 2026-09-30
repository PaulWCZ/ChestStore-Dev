import { chest } from "@argentic/chest-sdk/chest";
import { ChestError, Unavailable } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import * as mail from "@argentic/chest-sdk/mail";
import type { Query } from "./db.ts";
import type { Start } from "./forms.ts";
import { guessRoutes } from "./routes.ts";
import { getSetting } from "./settings.ts";
import type { Template } from "./templates.ts";

// The tools that receive Forms' answers: Clients (`crm`, a contact) and
// Support (`helpdesk`, a ticket). Installed is not enough: an admin of the
// Chest links the two tools for each kind of event (SDK studio.16,
// events.receivers), and until then every contact would publish into
// nothing. Settings greys a link and says why: the tool is not installed
// (chest.toolUrl, which also gives the link to it), or installed but not
// linked yet — ask an admin.
export const receivers = { contact: "crm", request: "helpdesk" } as const;
const types = { contact: "forms.contact", request: "forms.request" } as const;
export type LinkState = "linked" | "not_linked" | "not_installed";
export type Links = { contact: LinkState; request: LinkState };

export function installed(): { contact: boolean; request: boolean } {
  return { contact: chest.toolUrl(receivers.contact) !== null, request: chest.toolUrl(receivers.request) !== null };
}

// linkOf asks the Chest once, when a page is drawn (never cached: an
// admin's link shows at the next page). A Chest without events between
// tools links nothing; one that does not answer is taken at its word from
// the last time a tool was installed — the link stays usable, as before
// studio.16, rather than greyed by a hiccup.
export async function linkOf(kind: keyof typeof receivers): Promise<LinkState> {
  if (chest.toolUrl(receivers[kind]) === null) return "not_installed";
  try {
    return (await events.receivers(types[kind])).includes(receivers[kind]) ? "linked" : "not_linked";
  } catch (error) {
    if (error instanceof Unavailable) return "linked";
    if (error instanceof ChestError) return "not_linked";
    throw error;
  }
}

// Whether the Chest would send email now (mail.available, studio.16),
// asked before a page promises one: "off" (a Chest without mail),
// "not_connected" (the owner has not connected the company's email),
// "paused", "quota" (the day's emails are used). When the Chest does not
// answer, what the last email taught (lib/alerts.ts keeps mail_works), or
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

export async function links(): Promise<Links> {
  const [contact, request] = await Promise.all([linkOf("contact"), linkOf("request")]);
  return { contact, request };
}

// startOf: what a template's new form starts with — its links to the
// other tools already mapped (guessRoutes) and on when the receiving tool
// is linked, and the owner's alerts by email on for a public form
// unless the Chest has no email (none, or not connected: a pause or the
// day's quota passes; when it does not answer, the last email said).
export async function startOf(sql: Query, made: Template): Promise<Start> {
  const on = await links();
  const guess = guessRoutes(made.definition);
  const mailing = await mailState(sql);
  const audience = made.settings.audience ?? "public";
  return {
    definition: made.definition,
    settings: { ...made.settings, notifyEmail: audience === "public" && mailing !== "off" && mailing !== "not_connected" },
    routes: {
      contact: made.links?.contact && on.contact === "linked" && (guess.contact.email || guess.contact.phone) ? guess.contact : null,
      request: made.links?.request && on.request === "linked" ? guess.request : null,
    },
  };
}
