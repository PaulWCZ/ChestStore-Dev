import { createServer } from "node:http";
import postgres from "postgres";
import { databaseUrl } from "../../../packages/chest-client/src/database.js";
import { createApp } from "./app.js";
import { PostgresDatabase } from "./database.js";
import { ChestFiles } from "./files.js";
import { ChestLifecycle } from "./lifecycle.js";
import { ChestTeam } from "./members.js";
import { PostgresNotes } from "./notes.js";

// The entry of the tool (npm start): a node:http server on 127.0.0.1:$PORT,
// where the Chest's launcher relays its socket, and its database, whose
// address the Chest gives (databaseUrl, five connections at most), its
// files, kept by the Chest (files.ts), and its team, read from the Chest
// (members.ts), and what it is told of its members' lifecycle
// (lifecycle.ts). SIGTERM
// (the Chest stopping a version) closes the server and exits cleanly once
// the requests in flight are answered — 10 s at most.
const port = Number(process.env["PORT"] ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("testweb: PORT must be between 1024 and 65535");
  process.exit(2);
}
const sql = postgres(databaseUrl(), { max: 5, idle_timeout: 30, connect_timeout: 10, onnotice: () => undefined });
const notes = new PostgresNotes(sql);
const server = createServer({ headersTimeout: 10000, requestTimeout: 30000 }, createApp(notes, new PostgresDatabase(sql), new ChestFiles(), new ChestTeam(), new ChestLifecycle(notes)));
server.listen(port, "127.0.0.1", () => console.log(`testweb: listening on 127.0.0.1:${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(() => void sql.end({ timeout: 5 }).then(() => process.exit(0)));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
