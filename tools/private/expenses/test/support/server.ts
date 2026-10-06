import type { FakeMember } from "@argentic/chest-sdk/testing";
import { withMember } from "@argentic/chest-sdk/testing";
import { checkPage } from "@argentic/chest-app/testing";

// The server as built for the tests (npm test: dist/test/app.js), asked as
// the Chest asks it: a member signed by the fake Chest (withMember). Load
// it after testDatabase() (its db() reads DATABASE_URL on first use).
type App = { fetch(request: Request): Promise<Response> };
let built: App | undefined;
export async function server(): Promise<App> {
  built ??= ((await import("../../dist/test/app.js" as string)) as { app: App }).app;
  return built;
}

const url = (path: string) => `https://expenses-chest.chest.test${path}`;

// A page or a download; a page is checked for what the policy would block.
export async function get(who: FakeMember | null, path: string, headers: Record<string, string> = {}): Promise<Response> {
  const request = new Request(url(path), { headers });
  const response = await (await server()).fetch(who ? withMember(request, who) : request);
  if (response.headers.get("content-type")?.startsWith("text/html")) checkPage(await response.clone().text());
  return response;
}

// An action as call() sends it from an island.
export async function call(who: FakeMember | null, name: string, input: unknown): Promise<{ status: number; ok: boolean; value?: any; error?: string; message?: string }> {
  const request = new Request(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } });
  const response = await (await server()).fetch(who ? withMember(request, who) : request);
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, ...(type.startsWith("application/json") ? await response.json() as { ok: boolean } : { ok: false }) };
}

// What the Chest posts by itself (events, schedule runs), to the server.
export const deliver = async (request: Request): Promise<Response> => (await server()).fetch(request);
