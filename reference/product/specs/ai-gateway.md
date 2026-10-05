# AI gateway

**Specified 28 September 2026 from Paul's decisions of the same day; AI1
built, simplified the same day to OpenRouter only**
(batch AI in [status.md](../03_roadmap/status.md)). Replaces the “LLM gateway”
line of the [SDK and agents vision](../98_travail/sdk-and-agents-vision.md).
The owner's screen: [Owner space and billing](owner-space-and-billing.md);
the Chest's own agent, which spends through this gateway:
[Perseus Code](perseus-build.md). **AI1 is built** (with Perseus Code's
spike PB0; order decided by Paul on 28 September): Perseus Code uses the
connector.

## Goals

1. **One AI gateway for the whole Chest.** Tools call `ai.chat(…)`,
   `ai.embed(…)` through the SDK. **No tool ever sees a key**, and a tool needs
   no `network` entry to use AI.
2. **The company's own key (BYOK) first, OpenRouter only.** The owner or an
   admin pastes an OpenRouter API key (every major model through one key).
   Tools and Perseus Code use it through the gateway. No commission:
   OpenRouter bills the company directly. Other providers come later, one at
   a time, only when a real need asks for one (Paul, 28 September: “connectors
   as simple as possible, start only with OpenRouter BYOK”).
3. **Managed AI by Argentic comes later**: credits sold with a commission
   (e.g. through a partner agreement), a future revenue line (below).
4. **Private by default.** Zero-retention options where the provider offers
   them, models chosen by Argentic, usage logs **without prompt content**.
5. **Spend under control.** A monthly cap per tool set by the owner or an
   admin, an optional Chest-wide cap, alerts before the end.
6. **One path for everything that uses AI** — tools and
   [Perseus Code](perseus-build.md) — metered and observed the same way.

## Journeys

| Who | Journey |
|---|---|
| Builder (or agent) | Adds `"capabilities": ["ai"]` and an `ai` block to `chest.json`, calls `ai.chat({model: "default", messages})`; tests locally with `chest dev` ([develop and test](develop-and-test-tools.md)); proposes. |
| Owner, approving | Reads “Uses AI models through the Chest, up to €20 a month: summarises support tickets.” Approves; can change the limit later on the tool's settings without a new approval. |
| Owner or admin, first AI tool | Settings → AI: pastes the OpenRouter API key, Connect; the Chest checks it with OpenRouter before keeping it. Nothing else to set: the models are chosen by Argentic. |
| Member | Uses the tool. If the limit is reached or the key stops working, the tool says “AI features are paused” and the rest works. |
| Owner, month end | Settings → AI: what the Chest spent this month; a tool's settings: what it spent, its limit. |

## How a call flows

```mermaid
flowchart LR
  Tool[Tool_container] -->|"SDK ai.chat, CHEST_API socket"| GW[Chest_AI_gateway]
  GW -->|"checks: permission, model, cap, rate"| GW
  GW -->|"the connector's key"| Prov[Provider_API]
  GW -->|"usage line, no content"| Journal[AI_usage_journal]
```

The gateway runs **in the Chest** (the node process), not in the central: the
central stays out of business requests, a central outage does not stop AI, and
latency is one hop. The Chest itself, not the tool, reaches the provider.

## SDK and wire shape

```ts
import { ai } from "@argentic/chest-sdk";

const r = await ai.chat({
  model: "default",                       // an alias or an allowed model id
  messages: [{ role: "user", content: "Summarise: …" }],
  maxTokens: 800,
  tools: [/* JSON-schema tools, passed through */],
  responseFormat: { type: "json_schema", schema },
  member: m.id,                           // optional: attribution in the usage log
});
// r: { text, message, toolCalls, finishReason, model, usage: {input, output, cached, cost} }

for await (const chunk of ai.chat({ model: "fast", messages, stream: true })) { … }

const e = await ai.embed({ model: "embedding", input: ["a", "b"] });
const models = await ai.models();          // allowed models, aliases, prices per million tokens
```

| SDK | Tool API (on `CHEST_API`) | |
|---|---|---|
| `ai.chat` | `POST /ai/chat` | OpenAI Chat Completions shape; SSE when `stream` |
| `ai.embed` | `POST /ai/embeddings` | |
| `ai.models` | `GET /ai/models` | |
| `ai.usage` | `GET /ai/usage` | this tool's month: spent, cap |

**Compatible endpoint.** Many libraries (OpenAI SDK, Vercel AI SDK, LangChain)
expect an OpenAI-style base URL. The launcher also serves, inside the
container only, `http://127.0.0.1:<port>/v1` (same mechanism as the egress
proxy's local port) and sets `CHEST_AI_BASE_URL` and `CHEST_AI_KEY` (a
per-instance value worthless outside that container). Pointing a library at
it goes through the same gateway, checks and metering.

**Aliases.** `default`, `fast`, `smart`, `embedding` (and `build` later),
each led by the Chest to a model Argentic chose for the provider (OpenRouter:
Claude Sonnet 5, Gemini 2.5 Flash, Claude Opus 5, OpenAI text-embedding-3-small),
refreshed with the releases. The owner may choose another model for
`default` from a short list (Claude Sonnet 5, GPT-5, Gemini 2.5 Pro, Mistral
Medium 3.1, Gemini 2.5 Flash); nothing else. Tools use aliases: the model
changes for the whole Chest without touching code. The `build` alias (a strong coding model with tool calls)
serves [Perseus Code](perseus-build.md), which has its own budget line (per
session, per builder, per Chest). An `agent` alias for a Perseus that works
on its own is [not planned](perseus-build.md#later-not-planned).

**Pass-through features.** Tool use (`tools`, `tool_choice`; the gateway never
runs a tool), structured outputs, images in messages, reasoning options,
prompt caching where the provider supports it. The gateway speaks the OpenAI
shape; through OpenRouter it sets `provider.require_parameters: true` so
routing picks only providers that support what the request uses.

## Manifest

```json
{
  "capabilities": ["ai"],
  "ai": { "monthly": 20, "models": ["default", "embedding"], "purpose": "Summarises support tickets" }
}
```

| Key | Default | Sentence at approval |
|---|---|---|
| capability `ai` | — | “Uses AI models through the Chest, up to €20 a month: summarises support tickets.” |
| `monthly` | 5 (euros) | the amount in the sentence; the owner's cap replaces it |
| `models` | `["default"]` | “Models: default, embedding” when not only `default` |
| `purpose` | required, 120 characters | the end of the sentence |

Gaining `ai` is a new permission (owner or admin approval). The **cap is the
owner's**, set on the tool's settings, raised or lowered at any
time without a new version. A later version asking a higher `monthly` only
suggests it; it never raises the cap by itself.

## The connector (BYOK)

- **One connector: OpenRouter.** The owner or an admin pastes its API key.
  Write-only, stored like secret variables (encrypted with the node key),
  checked with OpenRouter (`GET /key`) before being saved, never returned by
  any route; the page shows its last four characters. A new key replaces the
  old one; Disconnect deletes it.
- **Metering**: tokens always; cost from OpenRouter's `usage.cost`, and a
  price table the Chest keeps for the models it offers (for the worst case
  reserved before a call). Limits are in estimated euros. The company's own
  OpenRouter account is the final limit.
- **Private by default, not a setting**: `provider.zdr: true` (only
  endpoints that keep nothing) and `provider.data_collection: "deny"` on
  every request. The page says it in one line.
- **Later, one provider at a time** (Anthropic, OpenAI, Mistral for EU
  residency, an OpenAI-compatible endpoint), when a real need asks: the
  code keeps a minimal provider table, so adding one is one entry and its
  choices of models.

## Later: managed AI by Argentic

A future revenue line, **not built now**: prepaid AI credits per Chest, sold
through Stripe with a commission (“model price + m %”), so an owner without
provider accounts gets AI in one click. It needs:

- **A partner agreement.** OpenRouter's terms (read 28 September 2026,
  section 7) forbid reselling API access; selling metered calls with a markup
  needs its written agreement (resale with commission, one sub-key per Chest
  with its limit set to the Chest's balance, EU routing, DPA, volume pricing)
  — or direct commercial agreements with Anthropic, OpenAI and Mistral.
- **Payment** ([Owner space and billing](owner-space-and-billing.md), batch
  PAY) and a credit ledger on the central: packs, optional auto top-up,
  expiry aligned with the partner's (OpenRouter: 365 days), alerts, a Chest
  balance with a hard stop.
- **Commission** covering the partner's purchase fee (OpenRouter 5.5 %),
  Stripe fees, exchange risk (USD cost, euro price), fraud and support, then a
  margin.
- Legal checks (LEG): prepaid credits usable only for Argentic's service, VAT
  at purchase, subprocessor register.

When it comes, it is one more provider (“Argentic AI”); the gateway, SDK and
limits do not change.

## Limits and quotas

| | Default | Set by |
|---|---|---|
| Monthly limit per tool | the manifest's `monthly` (5 € if absent) | owner, admins (the tool's settings) |
| Monthly limit for the Chest (optional) | none | owner, admins (Settings → AI) |
| Rate per tool | 60 requests a minute, 8 streams at once | owner, admins (up to 600 / 32) |
| Request body | 10 MiB (images included) | fixed |
| `maxTokens` | required ≤ the model's limit; the gateway fills a default of 4,096 | tool |
| Stream duration | 10 minutes | fixed |
| Chest-wide concurrency | 32 streams | fixed per plan (larger plans more) |

**No overshoot.** Before forwarding, the gateway reserves the worst case —
estimated input tokens + `maxTokens` at the model's price — against the tool's
cap and the Chest's cap; after the answer it settles to the real cost. A
request whose worst case does not fit is refused before any spend. A client
that disconnects mid-stream aborts the upstream request; the tokens already
produced are counted.

**Month totals survive restarts** (`installation/ai/month.json`, written with
each settlement), unlike in-memory rate counters.

**Alerts**: per tool at 80 % and 100 % of its cap (owner, admins, the tool's
builders); a connector's key refused (owner, admins).

## Errors

| Code | HTTP | When | SDK |
|---|---|---|---|
| `ai_not_granted` | 403 | the tool has no approved `ai` | `CapabilityNotGranted` |
| `model_not_allowed` | 403 | an alias the tool did not declare | `AiModelNotAllowed` |
| `cap_reached` | 402 | the tool's or the Chest's month cap (`scope`) | `AiCapReached` (`resetsAt`) |
| `rate_limited` | 429 | per-tool rate or streams; `Retry-After` | `RateLimited` |
| `no_connector` | 503 | no connector behind the alias, or the Chest is paused | `AiUnavailable` (`reason`) |
| `provider_key_invalid` | 502 | the connector's key refused by the provider | `AiUnavailable` (`reason`) |
| `provider_unavailable` | 503 | the provider failed | `AiUnavailable` |
| `content_refused` | 422 | the provider's moderation | `AiRefused` |
| `too_large` | 413 | body or context too large | `TooLarge` |

**Graceful degradation is part of the contract.** The template and the SDK
docs show the pattern: catch `AiCapReached` and `AiUnavailable`, keep the tool
usable without AI, say “AI features are paused” to the member. The build-time
check warns when a tool calls `ai` without handling these errors (a hint, not
a refusal).

## Screens

**Settings → AI** (owner and admins): one section, as Vercel and Supabase
show an integration.

```
AI
Let your tools and Perseus use AI models, with your OpenRouter key.

OpenRouter API key
[••••••••••••••••••••••••]  [Connect]
Get a key on openrouter.ai ↗

Private by default: requests go only to providers that keep no data and never train on it.
```

Connected:

```
AI                                                           Disconnect
Let your tools and Perseus use AI models, with your OpenRouter key.
■ Connected to OpenRouter · €23.40 of €100 spent this month
  Key ending …9QxT
Models                                        Claude Sonnet 5   Change
Monthly limit for the Chest                         [ 100 ] €   Save
Private by default: …
```

- **Connect** checks the key with OpenRouter; a refusal is said in one line
  under the field. **Disconnect** asks for a confirmation.
- **Change** opens a select of the short list; the choice is saved at once.
- **A tool's settings** (tools that ask for AI): “AI — This month €17.92 of
  €20”, “Near its monthly limit” from 80 %, “Limit reached”, “AI turned off”
  at 0; **Change limit** opens a small panel (back to what the tool asks).
- Nothing else on screen: usage charts, per-model views and journals go to
  the API for agents (AI3).

## Privacy and logs

- Usage line per call, `installation/ai/usage-YYYY-MM.jsonl`: time, tool,
  member id (if the tool gave one), agent id (for agent runs), alias,
  connector and model, input / output / cached tokens, cost, latency, status,
  request id. **Never the prompt, the answer, tool arguments or files.** Kept
  13 months, then aggregates only.
- **Keep prompts** (off; per tool, owner only, 24 hours at a time): for
  debugging, the Chest stores requests and answers encrypted on the server,
  shown on the tool's page to the owner and the tool's builders, deleted after
  24 hours; a banner on the tool's page says it is on.
- Nothing of AI usage reaches the central in v1.
- OpenRouter, once connected, is the company's own subprocessor.

## Agents and MCP

- **Perseus Code** calls the gateway from the harness in the node with the
  `build` alias (and `fast` for cheap steps), in the name of the builder, as
  long as each answer's model allows; its one limit is the Chest's monthly
  budget ([Perseus Code](perseus-build.md), “AI budget”).
- **Connected agents** (Claude Code on a laptop…) pay their own reasoning; they
  do not use the Chest's connector ([Connected agents](chest-agent.md)). An owner may allow a connected agent to
  call `POST /api/v1/ai/chat` (scripts, evaluations) with its own cap; off by
  default.
- `GET /api/v1/ai/usage` and the MCP tool `ai_usage` (per tool, per model,
  per day) for Maintainer agents and above; the connector and limits are changed
  by humans only.

## Data model

| Where | Record |
|---|---|
| Chest | `installation/ai/config.json`: the connector (provider, the key's last four characters, refused or not), the model chosen for `default`, per-tool limits, the Chest's limit |
| Chest | `installation/ai/keys.enc`: the connector's key, encrypted with the node key, never returned by any route |
| Chest | `installation/ai/month.json` (running totals, reservations), `usage-YYYY-MM.jsonl` |

## What to build, in lots

| Lot | Content | Depends on |
|---|---|---|
| **AI1 Gateway + OpenRouter** (**done**) | `chest/aigateway`: routes on the tool API, checks, reservations, streaming, usage journal, the OpenRouter connector (BYOK), models and prices chosen by Argentic; Settings → AI (one key, one model line, the Chest's limit), a tool's limit on its settings; manifest `ai` and its sentence; an internal principal for Perseus Code (alias `build`, its own budget line) remains | — |
| **AI2 SDK** | `ai.chat`, `embed`, `models`, `usage`, error classes; compatible endpoint in the launcher; `fakeChest` AI (canned or pass-through); template example with graceful degradation | AI1 |
| **AI3 Observability** | Usage chart, per-model view, keep-prompts switch, `/api/v1/ai/usage`, MCP `ai_usage` | AI1 |
| *Later: managed AI* | Partner agreement, “Argentic AI” connector, credits ledger, packs, commission, EU routing | AI1, PAY, the agreement |

Proofs: VM proof with a fake provider (streaming, tool calls, cap reached,
key refused, disconnect mid-stream counted, restart keeps totals, key never in
any response or log); a real BYOK call on a trial Chest.

## Open questions

1. Which provider after OpenRouter, and when (Mistral for EU residency, a
   direct provider for a large customer)? From real use only.
2. Managed AI, later: which partner (OpenRouter or direct providers) and what
   commission.
3. Per-member caps (a member who over-uses a tool)? Later, from real use.
