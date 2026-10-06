// The server as built for the tests (npm test builds it into dist/test):
// what the Chest posts (events, schedule runs) goes through its routes, as
// on a Chest. Its database is the test's (DATABASE_URL, set by
// test/support/db.ts before the first request).
export type Handler = (request: Request) => Promise<Response>;

export async function builtServer(): Promise<Handler> {
  const built = new URL("../../dist/test/app.js", import.meta.url).href;
  const { app } = await import(built) as { app: { fetch(request: Request): Promise<Response> } };
  return request => app.fetch(request);
}
