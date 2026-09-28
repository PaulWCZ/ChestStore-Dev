# Journey

The expected sequence, from the first purchase to operation.

## 1. Subscribe (central)

Subscribing is the moment a **Chest is opened**. The Owner creates their
**account on central** (`chest.argentic.app`): that is where they manage the
subscription and track the opening. When the Chest is ready, central hands
them a **single-use entry link**.

## 2. Enter the Chest

Through this link, the Owner arrives on their Chest and **creates their
password** there (or their passkey); from then on they always enter through
`login.acme.argentic.work`. The **Chest is empty**. Team, store,
member account, capacity, status. Subscription and billing stay on
central.

## 3. Invite and organise

On the Chest, the Owner invites **members** (link). Each member creates their sign-in on the Chest: email + password or
passkey; company SSO if the company has plugged it in. They are placed in their
**groups** from the invitation onward. No tool is designated by
the invitation itself. Members do not have the central subscription
account.

## 4. Install from the store

Examine a catalogue tool, its version, the manifest’s permissions;
approve. Granting access (all members, or some / groups) is a
second decision. A new Compartment is open only to the owner.

## 5. Use (private)

Internal parts and admin areas are used inside Chest, with technical
isolation. Direct URLs remain possible after member sign-in.

## 6. Open a public access

Form, shop, open page: reachable on the Internet. People on it do not become
**members** of the Chest. They remain **visitors** or become **end users**
through a **tool account** (SDK). End-user auth through the SDK.
Custom domain possible. Network visibility and anonymous access remain two
separate choices.

## 7. Create or adapt a tool

A member connects GitHub and can create an **agent key**. The agent (or the
human) uses the template and the SDK, then **pushes**; Chest fetches the code
and builds. Runtime: Node first, Python next. No general access to the VPS. Details: [For agents](../02_specs/for-agents.md).

## 8. Propose, then get approval

By default: proposal — the Owner or an admin validates installation and permissions.
Auto-deploy is possible if the Owner has allowed it for this member / this key, without
widening the manifest beyond the ceiling. The manifest speeds up the review.

## 9. Become a Builder

After validation, the author is the Builder of this tool. They can update it
without new approval as long as the manifest does not widen permissions.
Beyond that: the Owner or an admin must re-approve.

## 10. Evolve

New version **without** extra permissions: the Builder deploys.
New version that **asks for more** permissions: new approval.
Migrations, failures and removals must preserve data and make uncertain
operations visible.

## 11. Operate and recover

Chest monitors, backs up off the node, restores onto a fresh environment.
The company receives understandable information and can recover its
data.

## 12. Remove access or leave

New operations by a revoked **member**: refused. **Tool accounts**
(end users) remain separate and are managed in their Compartment.

Export, retention, termination and deletion: explicit rules.

## Expected success

1. Get your **empty** Chest.
2. Connect **GitHub** and obtain an **agent key**.
3. Invite your team.
4. Install from the store a **real** Forms tool (Next.js + database):
   several forms, collecting several responses, tracking per form.
5. Ship your **own** tool (agent + SDK, via GitHub push).
6. Get your data back after a **restore**.


## Where to go next

- [Building a tool](../02_specs/building-tools.md)
- [Security](../02_specs/security.md)
