// The package root as the studio publishes it (0.7.0-studio.N): 0.7.0's root
// (client/index.ts, verbatim beside this file) with the studio's modules in
// place of the official ones they extend — each re-exports its official
// module unchanged and adds the proposals — and the studio's own modules
// as namespaces. Each is also its own subpath (@argentic/chest-sdk/mail,
// /calendar, /webhooks, /visitors, /checks; /member, /chest, /files and
// /members are the extended ones). realtime/client runs in the browser and
// testing in a tool's tests only: neither is here.
export * from "../src/errors.js";
export * from "./member.js";
export * from "./chest.js";
export * from "../src/database.js";
export * as sealed from "../src/sealed.js";
export * as files from "./files.js";
export * as folders from "../src/folders.js";
export * as members from "./members.js";
export * as notifications from "../src/notifications.js";
export * as events from "../src/events.js";
export * as schedules from "../src/schedules.js";
export * as actions from "../src/actions.js";
export * as ai from "../src/ai.js";
export * as realtime from "../src/realtime.js";
// Studio proposals (not in 0.7.0).
export * as mail from "./mail.js";
export * as calendar from "./calendar.js";
export * as webhooks from "./webhooks.js";
export * as visitors from "./visitors.js";
export * as checks from "./checks.js";
