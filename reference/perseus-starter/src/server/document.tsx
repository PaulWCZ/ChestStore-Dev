import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

// A whole page rendered on the server: the browser's stylesheet and script
// (built by vite into dist/client/assets) and the page. The script only
// hydrates the islands of the page (src/client/main.tsx).
export function document(head: { title: string; language: string; nonce: string }, body: ReactNode): string {
  return "<!doctype html>" + renderToString(
    <html lang={head.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{head.title}</title>
        <link rel="stylesheet" href="/assets/client.css" />
        <script type="module" src="/assets/client.js" nonce={head.nonce} />
      </head>
      <body>{body}</body>
    </html>,
  );
}
