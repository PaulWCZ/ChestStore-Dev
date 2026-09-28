# Overview

Chest is a company’s managed software space: the company deploys its custom
tools there (often with a **coding agent**), invites its team, and relies on a
shared foundation — hosting, security, sign-in, files, mail, data — without
setting up or repairing a server.

A product **by Argentic**.

## Positioning

Like a governed internal-tools platform (company auth, permissions, SDK
without secrets) — **plus** the ability to expose **public pages** (visitors
and end users: shop, form, showcase).

One VPS **per** Chest; not a general-purpose shared multi-tenant host.

## The problem

Anyone can have an agent write a tool in an afternoon. Putting it into
production is another story: accounts, rights, hosting, files, mail,
isolation, public login. Ten tools, ten makeshift setups. Keys get scattered.

Chest gathers all of this into **one vault per company**. Tools live in
**Compartments**. The platform carries the foundation; the company carries the
business. The agent only has to use the **SDK** for security and the shared
building blocks.

## Two promises

### 1. Deploy your tools securely

A space to publish custom tools — vibe-coded or not — in a secure
environment. Chest takes care of:

- hosting (one dedicated VPS per Chest);
- security and isolation between tools;
- **member** sign-in and **roles** on private access;
- the SDK: **end-user** auth, files, mail, Postgres, **connectors**
  (capabilities, no keys in the app).

Collecting payments inside a tool (shop) will come later, through a **Stripe
connector** on public access. The Chest subscription itself happens at
opening, on central.

### 2. Replace SaaS subscriptions with the catalogue

A **store** of open-source tools, installable or **forkable** into the Chest.

## Agent moat

Initial target audience: people who build with their agents. The moat:

- **SDK** (security + building blocks);
- **GitHub** as a relay (push → Chest build / run);
- **agent key** to act on the Chest without the VPS;
- proposal or **auto-deploy** depending on Owner policy.

Fewer infrastructure choices = ideas shipped faster, within guardrails.

See [For agents](../02_specs/for-agents.md).

## Who it is for

| Who | What Chest gives them |
|---|---|
| Company head / Owner | Central account (subscription) + access to the Chest’s portal |
| Team (**members**) | Groups, a role in each tool, private access |
| Builder + **agent** | Agent key, linked GitHub, SDK; push → Compartment (proposal or auto-deploy) |
| A tool’s **end users** | Tool account on public access |
| **Visitors** | Anonymous public access if the tool allows it |

## What Chest provides

| Building block | Role |
|---|---|
| Central | Owner account, subscription, provisioning |
| Portal | Compartments, team, store — using the Chest |
| Store | Open-source catalogue; install or fork |
| GitHub + agent key | Code relay and API to publish from an agent |
| SDK | End users, files, mail, Postgres, roles, connectors |
| Manifest | Declares needs; a human approves |
| Runtimes | Node first, Python next |
| Access | Private (members) and/or public (visitors / end users, custom domain) |

## What Chest is not

- Not a multi-tenant host where all Chests share the same VM.
- Not an “internal only” platform: **public** access is part of the product.
- Not a mandatory built-in AI editor: you use your usual agent.
- Not a business SaaS: the business lives in the Compartments.
- Not a model vendor: the [AI gateway](../02_specs/ai-gateway.md) gives tools
  governed access to models (Argentic credits or the company's own keys).

## Where to go next

- [How it works](../02_specs/how-it-works.md)
- [For agents](../02_specs/for-agents.md)
- [Concepts](concepts.md)
