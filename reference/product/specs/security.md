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

A member connects **their own** GitHub installation, and only theirs: the
number GitHub puts on the way back is never believed on its own. The App
asks the member's GitHub authorization during installation; the central
binds the installation only when GitHub lists it among those that GitHub
user may access, then forgets the user's token. An installation serves
**one member of one Chest**: another Chest or another member is refused
it. The tokens the Chest reads GitHub with are narrowed to reading
(contents, metadata), and to the one repository whose code is read.
"Disconnect" removes the App from GitHub only when it is on the member's
own account; an organisation's installation stays for its administrators.
A return from GitHub that carries no ticket never says which Chest an
installation serves.

## Secrets and data

No secrets in the browser, logs, fixtures or repositories. Least
privilege: no general access to the neighbouring runtime, to the open network, or to the
data of another Compartment. Backups and restore: off the node,
understandable by the company.

## Accounts, HTTPS and builds

Decided 29 September 2026 (security audit, M1, M5, M8).

- **An invitation creates the invited address's account, no other.** The
  sign-in of a Chest verifies no address; only the link opens the account
  creation, and only for the address it invites. Whoever holds a link
  cannot create in advance the account of a colleague (with their own
  password or passkey) that this colleague's invitation would later admit.
  A creation for another address never reaches the identity provider: the
  person sees "This link invites another address", with the invited one,
  and carries on — never a bare refusal. The provider's own account pages
  are closed: a member's account is managed from the Chest.
- **HTTPS only.** Every name of the service (central, each Chest, its
  tools, its sign-in) tells browsers to use HTTPS only for a year,
  sub-names included; a tool's custom domain for itself alone. Entering
  the browsers' **preload list** is left to Paul's later decision: it
  covers whole domains (`argentic.work`, `argentic.app`) and is slow to
  undo.
- **A build reads the npm registry and reaches nothing else.** Install
  scripts run (many packages need them), but the build has no network of
  its own, no secret, no variable of the tool: it reads the registry
  through the Chest (no publish, no other host). A package that downloads
  from elsewhere at install fails, saying so. The same rule holds in
  Perseus's workbenches. A tool never reuses what another tool's build
  left in the build cache.
- **Reading a database never writes**, even through a function of the
  tool that runs with the tool's rights.

## Builders, admins and agents

Decided 29 September 2026 (security audit, H1, M2, M3 and the agent
tokens).

- **Code that runs sees the data.** A tool's code reaches its database, its
  files and the secret variables it is given, whatever the Chest shows its
  author. So the code of a builder who is **not** allowed to see a tool's
  data never runs in that tool before the owner or an admin approves it:
  their push, their Perseus Code publication or their "Update" leaves a
  version to approve on the tool's Deployments ("Written by Léo, who does
  not see this tool's data"), the owner and the admins are told in their
  inbox, and one click approves it. A builder allowed to see the data
  keeps putting their versions in service themselves; a version that asks
  for more still waits for the owner or an admin, whoever wrote it.
- **What a tool prints is its data.** Its runtime log (what it writes on
  its outputs) is shown to whoever sees its data; a builder who does not
  sees the Chest's own lines only (starts, stops, health), and their
  builds' logs, which never carry data.
- **What guards the owner is the owner's.** Only the owner removes an
  admin, and only the owner switches the sign-in code on or off; both are
  written in the Chest's journal.
- **An agent never takes a person's decision.** A token (an agent, an
  assistant, a script) never installs a tool, links a repository or
  approves a version, whoever made it — the owner included: what a model
  reads (a form's answers, a log) may steer it. It gets "approval
  required" with the page where the owner or an admin decides; asking to
  install a tool records a proposal they approve in the Chest. A human
  confirmation implemented by the agent's own software is no confirmation
  and is not offered.
- **A token only reads unless its member chooses otherwise**, when it is
  made. The owner's and the admins' tokens live **30 days at most**; a
  member's 30 or 90. A token does not ask for the sign-in code: it is kept
  like a password, and the page that makes it says so.

## Floods never lock out the others

Decided 29 September 2026 (security audit, H3, H4, M9 and the central's
mail reputation).

- **A limit is per client or per customer, never one for everybody.** A
  flood from one address slows that address alone: the sign-ins of a Chest
  or of the central (twenty a minute per address), the central's SMTP gate
  (two connections per address). Once a Chest is authenticated, it is
  counted as itself: its calls to the central (sign-in codes, invitations,
  password resets, GitHub tokens, health reports) and its connections to
  the gate. A Chest looping, or a stranger guessing tokens, never delays
  another customer. A sign-in under way belongs to its browser: starting
  many only pushes out one's own.
- **Signing up at the central records nothing.** An account is only an
  account; a request is recorded when an admitted person chooses the name
  of their Chest. Requests nobody will open (the address is no longer
  admitted, or no name was chosen) are removed after seven days, and their
  names are free again. A flood of sign-ups cannot fill the central.
- **The central's mail is everybody's reputation.** A Chest sends at most
  40 mails a day through the central; the service as a whole at most 400
  an hour and 2,000 a day. The central's journal carries an alert for the
  operators when a Chest reaches its quota, and when the service reaches
  four fifths of its day.

## Certificates

Decided 29 September 2026. Each Chest has **one certificate for its whole
address**: `acme.argentic.work` and `*.acme.argentic.work`, which covers
every tool (`forms.`, `forms-chest.`) and every Perseus draft. Installing a
tool or opening a draft never asks the certificate authority for anything,
so a Chest with many tools stays far from its limits (per registered
domain and per week). The sign-in (`login.`) keeps a certificate of its
own, and the node control its private pinned one: a browser never reuses
a connection of the portal for them. A custom domain of a tool keeps its
own certificate, one per name.

A wildcard is proven through DNS (ACME DNS-01). The **Chest holds no DNS
credential**: it asks the central, under the token it was enrolled with, to
publish the proof at `_acme-challenge.<its name>` and to withdraw it after.
The central holds the zone's token and accepts only the name of the Chest
that token belongs to. Keys never leave the Chest; renewal is automatic,
and a failed renewal raises the operators' certificate alert (14 days
before expiry, [fleet monitoring](fleet-monitoring.md)).

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
