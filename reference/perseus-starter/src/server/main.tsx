import { serve } from "@hono/node-server";
import { app } from "./app.js";

// The Chest sets PORT; it relays its requests there.
const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" });
process.on("SIGTERM", () => server.close());
