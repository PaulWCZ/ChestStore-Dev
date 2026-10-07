# reference/ — snapshots of the platform (read-only)

The Chest's own repositories and product documents are private or live
elsewhere; this folder carries copies of what a tool builder needs. **Do not
edit them** — they are refreshed from their sources by the owner. If something
here is wrong or unclear, write it in the SDK report.

Snapshot of **7 October 2026** (the previous ones: 5 October 2026, SDK
0.4.1; 28 September 2026, SDK 0.2.0). What changed since, and what it asks
of the studio: [brief/09-update-sdk-0.5.md](../brief/09-update-sdk-0.5.md)
(and, before it, [brief/08-update-2026-10.md](../brief/08-update-2026-10.md)).

| Folder | Source | Version |
|---|---|---|
| `sdk/` | `chest-by-argentic/Chest-SDK` — the official SDK: `client/` (modules and tests), `contract/` (the tool contract: every key of `chest.json`, the repository, migrations, CSP, Next.js — rendered from the Chest's code), `check/` (`chest check`, the Chest's validator in WebAssembly), `README.md`, `AGENTS.md` | `main`, commit `968292f` (7 October 2026) = `@argentic/chest-sdk` **0.5.0**, tool contract **0.5** — merged, **not yet published on npm** (pack it from here: `npm ci && npm pack`) |
| `perseus-starter/` | The official starter Perseus Code lays in every new project (`chest/perseus/starter` of the Chest repository): TypeScript, Hono, React rendered on the server with islands, Vite, a nonce CSP, a test. The Chest puts the SDK tarball in its `vendor/` (`vendor/chest-sdk-0.5.0.tgz`, not copied here: pack it from `sdk/`) | Chest repository `548e697` |
| `testweb/` | The Chest's server test bench, exported as a standalone tool (`node tests/export/export-store.mjs testweb`): plain `node:http`, uses every SDK feature (members, groups, files, uploads, notifications, broadcast, events between tools, schedules, AI, realtime, egress; sealed values: see Chat); its `packages/chest-client` is SDK 0.5.0's source | Chest repository `548e697` |
| `forms/` | `chest-by-argentic/forms` — the first catalogue tool: Next.js, database, public + private parts, CSP with a nonce, `"chest": "0.4"`, SDK 0.4.0 vendored (not refreshed: its move to 0.5.0 is pending review) | commit `d0fe2a2` |
| `contract/application-contract.md` | The Chest's `docs/architecture.md`, sections "Application contract", "Contract map", "Languages" — how the Chest builds, runs, routes and serves a tool (events between tools, sealed values, realtime included), Perseus Code's drafts, what exists and what remains | Chest repository `548e697` |
| `product/vision/` | What Chest is: overview, concepts (the vocabulary), the customer journey | 5 October 2026 |
| `product/specs/` | Decided product specifications: how it works, building tools, agents, members and notifications (groups, broadcast, the phone and push), mail, tool storage, AI gateway, develop and test tools, security, addresses (embedding included), scheduled tasks, realtime, sealed data, events between tools, the store's Chat, Perseus Code. Refreshed on 7 October: `addresses`, `mail` (new), `members-and-notifications`, `perseus-build`, `realtime`, `sealed-data` (new), `store-chat` (new), `tool-events` (new), `tool-storage` | 5 and 7 October 2026 |
| `product/proposals/sdk-and-agents-vision.md` | **A proposal, not a decision**: the SDK primitives that could come next, with opinions | 5 October 2026 |

The official Chat tool is not copied here: it is public,
[`chest-by-argentic/chat`](https://github.com/chest-by-argentic/chat).

`../sdk/` is not a snapshot: it is the studio's working copy of the SDK (its
proposals on top of an official release). `reference/sdk/` is the official
release it is rebased onto.

Product documents describe the target; what is actually built is what the
contract and the SDK say. Links between product pages may point to pages not
copied here: ignore them.
