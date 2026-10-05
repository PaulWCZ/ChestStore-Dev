# reference/ — snapshots of the platform (read-only)

The Chest's own repositories and product documents are private or live
elsewhere; this folder carries copies of what a tool builder needs. **Do not
edit them** — they are refreshed from their sources by the owner. If something
here is wrong or unclear, write it in the SDK report.

Snapshot of **5 October 2026** (the previous one: 28 September 2026, SDK
0.2.0). What changed since, and what it asks of the studio:
[brief/08-update-2026-10.md](../brief/08-update-2026-10.md).

| Folder | Source | Version |
|---|---|---|
| `sdk/` | `chest-by-argentic/Chest-SDK` — the official SDK as released: `client/` (modules and tests), `contract/` (the tool contract: every key of `chest.json`, the repository, migrations, CSP, Next.js — rendered from the Chest's code), `check/` (`chest check`, the Chest's validator in WebAssembly), `README.md`, `AGENTS.md` | tag `v0.4.1`, commit `6ec5f41` (1 October 2026) = `@argentic/chest-sdk` **0.4.1** on npm, tool contract **0.4** |
| `perseus-starter/` | The official starter Perseus Code lays in every new project (`chest/perseus/starter` of the Chest repository): TypeScript, Hono, React rendered on the server with islands, Vite, a nonce CSP, a test. The Chest puts the SDK tarball in its `vendor/` (`vendor/chest-sdk-0.4.1.tgz`, not copied here: use `npm install @argentic/chest-sdk@0.4.1`) | Chest repository `0c2bcfd` |
| `testweb/` | The Chest's server test bench, exported as a standalone tool (`node tests/export/export-store.mjs testweb`): plain `node:http`, uses every SDK feature (members, files, uploads, notifications, events, schedules, AI, egress); its `packages/chest-client` is SDK 0.4.1's source | Chest repository `0c2bcfd` |
| `forms/` | `chest-by-argentic/forms` — the first catalogue tool: Next.js, database, public + private parts, CSP with a nonce, `"chest": "0.4"`, SDK 0.4.0 vendored | commit `d0fe2a2` |
| `contract/application-contract.md` | The Chest's `docs/architecture.md`, sections "Application contract", "Contract map", "Languages" — how the Chest builds, runs, routes and serves a tool, Perseus Code's drafts, what exists and what remains | Chest repository `0c2bcfd` |
| `product/vision/` | What Chest is: overview, concepts (the vocabulary), the customer journey | 5 October 2026 |
| `product/specs/` | Decided product specifications: how it works, building tools, agents, members and notifications, tool storage, AI gateway, develop and test tools, security, addresses, scheduled tasks, realtime (specified, not decided), Perseus Code | 5 October 2026 |
| `product/proposals/sdk-and-agents-vision.md` | **A proposal, not a decision**: the SDK primitives that could come next, with opinions | 5 October 2026 |

`../sdk/` is not a snapshot: it is the studio's working copy of the SDK (its
proposals on top of an official release). `reference/sdk/` is the official
release it is rebased onto.

Product documents describe the target; what is actually built is what the
contract and the SDK say. Links between product pages may point to pages not
copied here: ignore them.
