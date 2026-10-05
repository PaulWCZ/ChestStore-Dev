import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { member } from "@argentic/chest-sdk/member";
import { document } from "./document.js";
import { ChestPage } from "../ui/ChestPage.js";

type Env = { Variables: { nonce: string } };

// The tool's server: its members' part under /chest (the Chest signs the
// member in and asserts who they are on every request), the browser's
// files under /assets/. A public part, when chest.json declares
// "public": true, is any other path — none here.
export const app = new Hono<Env>();

// Every answer carries the tool's own policy, a fresh nonce per answer: the
// page's scripts are the tool's own files, nothing inline runs without the
// nonce, nothing comes from elsewhere.
app.use(async (c, next) => {
  const nonce = randomBytes(16).toString("base64");
  c.set("nonce", nonce);
  await next();
  c.header("Content-Security-Policy", `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`);
});

app.use("/assets/*", serveStatic({ root: "./dist/client" }));

app.get("/chest", (c) => {
  const who = member(c.req.raw);
  if (!who) return c.text("Open this tool from your Chest.", 401);
  return c.html(document({ title: "My tool", language: who.language, nonce: c.get("nonce") }, <ChestPage firstName={who.firstName} />));
});
