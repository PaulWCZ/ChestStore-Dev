// The server as `npm test` builds it (dist/test/app.js): what the Chest
// posts (events, schedule runs, received emails) goes through its routes,
// as on a Chest. Built with its own copy of the SDK and the package: a
// test reads what it did in the database, the fake Chest's outbox and bell.
export type App = { fetch(request: Request): Promise<Response> };
const path = "../../dist/test/app.js";
export async function built(): Promise<App> {
  const loaded = (await import(path)) as { app: App };
  return loaded.app;
}
