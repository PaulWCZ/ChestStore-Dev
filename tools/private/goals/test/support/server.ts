// The server as built for the tests (npm test: vite build --ssr --outDir
// dist/test), asked as the Chest asks it. Import it once the fake Chest and
// the database are up (it reads their addresses when it is first asked).
// It bundles its own copy of the SDK and of src/lib/: its caches are not
// the test's (app/AGENTS.md, Pitfalls).
export type Server = (request: Request) => Promise<Response>;
export async function server(): Promise<Server> {
  const { app } = await import("../../dist/test/app.js" as string) as { app: { fetch(request: Request): Response | Promise<Response> } };
  return async request => app.fetch(request);
}
