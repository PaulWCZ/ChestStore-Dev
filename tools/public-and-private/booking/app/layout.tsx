import { Toasts } from "@argentic/chest-ui/components";
import { ThemeStyle } from "@argentic/chest-ui/react";
import { lookColors, nonceOf } from "@argentic/chest-ui/runtime";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale } from "../lib/session.ts";
import { currentLook } from "../lib/theme.ts";
// The kit's components first, so the tool's own CSS can restyle them.
import "@argentic/chest-ui/components.css";
import "./tokens.css";
import "./globals.css";

// Every page is rendered per request: the nonce of its policy (proxy.ts),
// the member the Chest asserts, their language, the data as it is now.
// Nothing is written to disk at run time — the disk is read-only.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = catalogue(await pageLocale());
  return { title: t.meta.name, description: t.meta.tagline, robots: { index: false, follow: false } };
}

export async function generateViewport(): Promise<Viewport> {
  return { width: "device-width", initialScale: 1, themeColor: lookColors(await currentLook()) };
}

// The look (lib/theme.ts) is one <style> in the head, with the page's
// nonce: its colours, fonts and dark mode arrive with the page, no script.
// The kit's toasts wrap every page (members' and public ones).
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, look, nonce] = await Promise.all([pageLocale(), currentLook(), headers().then(h => nonceOf(h.get("content-security-policy")))]);
  const t = catalogue(locale);
  return (
    <html lang={locale}>
      <head>
        <ThemeStyle look={look} nonce={nonce} />
      </head>
      <body><Toasts labels={t.toast}>{children}</Toasts></body>
    </html>
  );
}
