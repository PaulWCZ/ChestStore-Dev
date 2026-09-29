import * as chest from "@argentic/chest-sdk/chest";
import type { Query } from "./db.ts";
import type { Start } from "./forms.ts";
import { guessRoutes } from "./routes.ts";
import { getSetting } from "./settings.ts";
import type { Template } from "./templates.ts";

// The tools that receive Forms' answers, as the Chest lists them
// (Proposal (studio): chest.toolUrl, SDK studio.14): Clients (`crm`, a
// contact) and Support (`helpdesk`, a ticket). A link to a tool that is
// not installed would publish into nothing: Settings greys it and says so.
export const receivers = { contact: "crm", request: "helpdesk" } as const;
export type Installed = { contact: boolean; request: boolean };

export function installed(): Installed {
  return { contact: chest.toolUrl(receivers.contact) !== null, request: chest.toolUrl(receivers.request) !== null };
}

// startOf: what a template's new form starts with — its links to the
// other tools already mapped (guessRoutes) and on when the receiving tool
// is installed, and the owner's alerts by email on for a public form
// unless the Chest's mail is known to be missing (lib/alerts.ts learns it
// at the first email).
export async function startOf(sql: Query, made: Template): Promise<Start> {
  const on = installed();
  const guess = guessRoutes(made.definition);
  const mail = (await getSetting<boolean>(sql, "mail_works")) ?? null;
  const audience = made.settings.audience ?? "public";
  return {
    definition: made.definition,
    settings: { ...made.settings, notifyEmail: audience === "public" && mail !== false },
    routes: {
      contact: made.links?.contact && on.contact && (guess.contact.email || guess.contact.phone) ? guess.contact : null,
      request: made.links?.request && on.request ? guess.request : null,
    },
  };
}
