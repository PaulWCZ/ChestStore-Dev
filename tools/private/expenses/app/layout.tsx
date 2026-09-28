import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale } from "../lib/session.ts";
import "./fonts/public-sans.css";
import "./fonts/jetbrains-mono.css";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#131412" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await pageLocale();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
