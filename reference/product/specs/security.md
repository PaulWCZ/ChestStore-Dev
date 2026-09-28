# Security and boundaries

Rules to keep. Authoritative authorisation decisions are made on the server
side. Deny by default.

## Two gates (private access)

1. **Gate 1** — is the person a member of *this* Chest?
2. **Gate 2** — do they have access to *this* Compartment (directly, or through one of
   their **groups**)?

Membership of the Chest opens no tool. A non-member must learn nothing
useful about the inventory of Compartments.

On private access, the tool can additionally read the member’s **roles** (SDK) for
its business rules.

## Public path

Separate from the two gates. The person is **not** a member of the Chest. Without
an account: **visitor**. With a **tool account**: **end user** of this Compartment
only. This account opens neither the team nor the other Compartments.

Auth and recovery of tool accounts: a reusable mechanism provided by
Chest / the SDK, so that each tool does not reinvent the wheel.

Example: shop — employees = **members** (private admin access); customers =
**end users** (shop account on public access).

## Platform ≠ business

Chest controls identity, application, platform permissions. The tool then
controls its business rules (e.g. which orders a customer sees). Builder or
author status is **never enough** to open all business data.

## Manifest, SDK and connectors

- The manifest **requests**; approval **grants**; the runtime **enforces**.
- The SDK is not a security boundary. Direct accesses go through the
  same controls.
- **Connectors**: the app receives **capabilities**, not credentials. Outside
  the approved scope → refusal.

## Origins and UI isolation

A shop can have its admin in Chest and its storefront on the Internet. The
script of an untrusted package **must never** run under the origin of the
Chest session. A shared experience on the portal side ≠ mixing technical origins.

## Payments

Tool payments: later, through a **Stripe connector** with the company’s Stripe
account. Like any connector: secrets kept out of the browser and out of
tool code, bounded capabilities.

Billing for the Chest subscription stays separate.

## Agent key and GitHub

The **agent key** is a member’s secret, scoped, revocable — not host access.
The Chest **fetches** the code from the linked GitHub repository — GitHub only
**rings** (a signed, verified call that carries no code); build and run stay under Chest control.
Auto-deploy never authorises a manifest wider than the Owner policy.

## Secrets and data

No secrets in the browser, logs, fixtures or repositories. Least
privilege: no general access to the neighbouring runtime, to the open network, or to the
data of another Compartment. Backups and restore: off the node,
understandable by the company.

## Revocation

A removed member: their **new** operations are refused. Sessions and
tokens must follow this rule without an improvised “business” delay.

## Discipline

Do not turn an abandoned idea into a product commitment. The controls
announced in this documentation are rules to follow during implementation, not
proofs already obtained.

## Where to go next

- [How it works](how-it-works.md)
- [Addresses](addresses.md)
- [AGENTS.md](../../AGENTS.md) — code rules (SoC, DRY, security first)
