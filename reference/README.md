# reference/ — snapshots of the platform (read-only)

The Chest's own repositories and product documents are private or live
elsewhere; this folder carries copies of what a tool builder needs. **Do not
edit them** — they are refreshed from their sources by the owner. If something
here is wrong or unclear, write it in the SDK report.

Snapshot of **28 September 2026**. The SDK is not here: `../sdk/` is the
studio's fork of it, starting from `chest-by-argentic/Chest-SDK` commit
`387ae90` — exactly `@argentic/chest-sdk` 0.2.0 as published on npm.

| Folder | Source | Version |
|---|---|---|
| `forms/` | `chest-by-argentic/forms` — the first store tool: Next.js, database, public + private parts, i18n, CSP | commit `a335cd4` |
| `testweb/` | The Chest's server test bench, exported as a standalone tool: plain `node:http`, uses every SDK feature (members, files, uploads, notifications, events, egress) | Chest repository `8f0e22f` |
| `contract/application-contract.md` | The Chest's `docs/architecture.md`, sections "Application contract", "Contract map" — the exact rules of the manifest, the build, the runtime, the front, the services | Chest repository `8f0e22f` |
| `product/vision/` | What Chest is: overview, concepts (the vocabulary), the customer journey | 28 September 2026 |
| `product/specs/` | Decided product specifications: how it works, building tools, agents, members and notifications, tool storage, AI gateway, develop and test tools, security, addresses | 28 September 2026 |
| `product/proposals/sdk-and-agents-vision.md` | **A proposal, not a decision**: the SDK primitives that could come next, with opinions | 28 September 2026 |

Product documents describe the target; what is actually built is what the
contract and the SDK say. Links between product pages may point to pages not
copied here: ignore them.
