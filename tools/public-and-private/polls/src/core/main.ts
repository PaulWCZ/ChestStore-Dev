import { serve } from "@hono/node-server";
import { app } from "../app.tsx";
import { log } from "./log.ts";

// The Chest sets PORT and relays its requests there. It stops the tool
// with SIGTERM when it sleeps or switches versions: nothing kept in memory
// must survive (the database and the files are the tool's memory).
const port = Number(process.env["PORT"] ?? 3000);
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => log.info("listening", { port }));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
