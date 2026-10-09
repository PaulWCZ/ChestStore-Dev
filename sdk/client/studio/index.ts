// The package root as the studio publishes it (0.4.1-studio.N): 0.4.1's root
// (client/index.ts, verbatim beside this file) with the studio's modules in
// place of the official ones they extend — each re-exports its official
// module unchanged and adds the proposals — and the studio's own modules
// as namespaces. Each is also its own subpath (@argentic/chest-sdk/mail,
// /calendar, /webhooks, /visitors, /checks; /member, /chest, /files,
// /members, /notifications and /events are the extended ones). testing is
// for a tool's tests only, and is not here.
export * from "../src/errors.js";
export * from "./member.js";
export * from "./chest.js";
export * from "../src/database.js";
export * as files from "./files.js";
export * as members from "./members.js";
export * as notifications from "./notifications.js";
export * as events from "./events.js";
export * as schedules from "../src/schedules.js";
export * as ai from "../src/ai.js";
// Studio proposals (not in 0.4.1).
export * as mail from "./mail.js";
export * as calendar from "./calendar.js";
export * as webhooks from "./webhooks.js";
export * as visitors from "./visitors.js";
export * as checks from "./checks.js";
