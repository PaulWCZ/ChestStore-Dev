// The server as built for the tests (npm test: vite build --ssr --outDir
// dist/test), asked as the Chest asks it. It has its own copy of src/lib
// (its own pool, read from DATABASE_URL, which testDatabase() sets), so a
// test file uses either it or the services directly on one database.
type App = { fetch(request: Request): Promise<Response> };
let built: App | undefined;
export async function server(): Promise<App> {
  built ??= ((await import("../../dist/test/app.js" as string)) as { app: App }).app;
  return built;
}
// A request to the built server (a page, a download), relative to the tool.
export async function fetchApp(request: Request): Promise<Response> {
  return (await server()).fetch(request);
}
