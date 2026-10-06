// @argentic/chest-app — the server side of a Chest tool (the browser's is
// "@argentic/chest-app/client"). README.md says why, AGENTS.md how.
import { serve as listen } from "@hono/node-server";
import { log } from "./log.ts";

export { createApp, page, publicPage, publicActionsAt, rawRoute, sameOrigin, policy, formToken, type AppOptions, type LayoutProps, type Look, type PageContext, type View, type Viewer } from "./http.tsx";
export { Island, type Plain } from "./island.tsx";
export { Honeypot } from "./form.tsx";
export { action, publicAction, field, fail, notFound, forbidden, redirect, after, toolPath, cutText, AppError, HttpStatus, type Bound, type Budget, type PublicContext, type Action, type Cookies, type Field, type Fields, type InputOf, type SentOf, type MemberContext, type VisitorContext, type Outcome } from "./tool.ts";
export { fill, formatter, localeIn, publicLocale, dateFormat, numberFormat, type Format, type Plural } from "./i18n.ts";
export { csvLine } from "./csv.ts";
export { zipStream, type ZipEntry } from "./zip.ts";
export { log } from "./log.ts";
export type { Register, CoreWords, Words, ErrorCode } from "./register.ts";

// serve(app): the server on PORT (the Chest sets it and relays its
// requests there). SIGTERM (the tool goes to sleep, or a new version
// takes over) closes it and exits at once — nothing kept in memory must
// survive: the database and the files are the tool's memory.
export function serve(app: { fetch(request: Request): Response | Promise<Response> }): void {
  const port = Number(process.env["PORT"] ?? 3000);
  const server = listen({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => log.info("listening", { port }));
  process.on("SIGTERM", () => {
    server.close();
    process.exit(0);
  });
}
