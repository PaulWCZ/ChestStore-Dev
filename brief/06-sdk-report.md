# 6. The SDK report (`reports/03-sdk-report.md`)

The goal of the SDK: **nobody should be limited by the platform, only by their
imagination** — while keeping what makes Chest safe (the owner approves each
permission in one plain sentence; the Chest enforces it; the tool never holds
a provider's key).

You are the first team to build many real tools on it. Be critical, specific
and constructive. The best evidence is "tool X needed Y; here is what we had to
do instead; here is the API that would have made it trivial".

## What the report contains

1. **Summary** — the five changes that would matter most, in order, in one
   line each.
2. **What works well** — keep it; say why.
3. **Friction in what exists** — per module (`member`, `members`, `database`,
   `files`, `notifications`, `events`, `errors`, `testing`) and for the
   manifest, the build, the limits: bugs, surprising behaviour, missing
   options, unclear docs, error messages. Point to the file and line in
   `reference/` when you can.
4. **Missing primitives** — one section each, with:
   - the tools that need it, and its implementation in the SDK working copy
     (`sdk/client/src/<feature>.ts`, its `fakeChest` part, its tests);
   - the proposed API (TypeScript signatures) and manifest shape;
   - its approval sentence for the owner ("Sends emails from your company
     address, up to 500 a day");
   - quotas and limits, what the Chest logs, how agents reach it, how
     `testing` fakes it;
   - the risks (security, abuse, cost on a small server) and how to bound them;
   - how the best platforms do it (Supabase, Vercel, Cloudflare, Firebase,
     Val Town, Windmill, PocketBase, Appwrite, Retool, Railway…) and what we
     should do better.
5. **Public-facing tools** — what accounts for outside users, payments,
   public uploads, webhooks, email and custom domains must look like for a
   shop, a booking page, a customer portal or a job board to be real.
6. **Tools as a suite** — events between tools, shared concepts (people,
   companies/contacts, files, calendar), deep links, a shared search; what
   the platform should own and what stays in each tool.
7. **Developer and agent experience** — what it was like to build 10+ tools
   with it: the local loop (`chest dev`), templates, `chest check`, docs,
   types, errors. What an agent needs to build a correct tool on the first try.
8. **Priorities** — a table: primitive, tools unblocked, effort (S/M/L),
   risk, proposed order.

## Starting points

- `reference/product/proposals/sdk-and-agents-vision.md` already lists
  candidate primitives with an opinion on each. It is a proposal, not a
  decision: confirm, challenge or reorder it **with evidence** from your
  tools. Do not just restate it.
- Specified but not built: `reference/product/specs/ai-gateway.md`,
  `develop-and-test-tools.md`, `tool-storage.md` (public files and uploads),
  `chest-agent.md`. Comment on them from a tool builder's point of view.
- The principles to respect (from the proposal): Postgres first (no primitive
  where the tool's database does the job); a capability is a sentence, with a
  quota, a journal, agent access and a fake in `testing`; capabilities, not
  credentials; the SDK stays dependency-free (`node:*` only).

The working copy `sdk/` is the report's proof: every proposed primitive exists
there, typed, tested, faked, and used by at least one tool. The report
explains it; the working copy's diff against its first commit shows it.

Write the report progressively: add to it each time a tool hits a wall, then
consolidate it in step 4.
