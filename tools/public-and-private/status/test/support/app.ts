// The server as `npm test` builds it (dist/test/app.js: src/app.tsx and
// everything it serves), for the tests that reach a route — a delivery of
// the Chest's (/chest-checks, /chest-events, /chest-schedules,
// /chest-webhooks) or a page. Loaded once, on first use, after the test's
// fake Chest and database are set: the server reads them at each request.
type App = { fetch(request: Request): Response | Promise<Response> };
let loaded: Promise<App> | undefined;

export function builtApp(): Promise<App> {
  const path = "../../dist/test/app.js";
  loaded ??= (import(path) as Promise<{ app: App }>).then(m => m.app);
  return loaded;
}

// A route as the fake Chest posts to it: (request) => response.
export const toApp = async (request: Request): Promise<Response> => (await builtApp()).fetch(request);
