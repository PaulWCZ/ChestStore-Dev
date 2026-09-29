import * as chest from "@argentic/chest-sdk/chest";

// The company's logo on a respondent's page, when the owner gave the
// Chest their brand (Proposal (studio): chest.theme(), brand mode). Its
// files are served by the Chest on the tool's own hosts (/_chest/theme/),
// which the pages' policy admits. Forms keeps its own look otherwise: a
// form is the company speaking, the logo says who.
export async function companyLogo(): Promise<{ url: string; dark: string | null } | null> {
  const choice = await chest.theme();
  if (choice.mode !== "brand" || !choice.brand.logo) return null;
  return { url: choice.brand.logo.url, dark: choice.brand.logo.dark };
}
