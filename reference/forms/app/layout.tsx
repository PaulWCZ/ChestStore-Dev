import type { Metadata } from "next";
import type { ReactNode } from "react";
import { words } from "../lib/session.ts";
import "./globals.css";

// Every page is rendered per request: the nonce of its policy (proxy.ts),
// the member the Chest asserts, the language of the browser, the forms as
// they are now. Nothing is written to disk at run time — the Chest runs this
// server on a read-only file system.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await words()).appName, robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={(await words()).lang}>
      <body>{children}</body>
    </html>
  );
}
