# Concepts

Reference vocabulary. One definition per term.

## People

| Term | Definition |
|---|---|
| **Member** | Person invited into the **Chest** (team). Access through the Chest’s portal. Membership belongs to the Chest, never to a Compartment. |
| **Owner** | Owner of the Chest. **Account on central** (subscription, billing, opening tracking) **and** **member** access on the Chest’s portal. Two separate accounts: central hands the Chest over once, through a single-use link; the Owner then creates their sign-in on the Chest. Approves installations and critical settings. |
| **Admin** | Delegated administrator of the **Chest**; may be allowed to approve like the Owner. An admin is a member of the Chest — not the subscription manager on central (unless also the Owner). |
| **Group** | Set of **members** of the Chest (“Sales”, “Accounting”). A person is placed in groups from the invitation onward. It is the group that opens Compartments. |
| **Role** | What a member is **within a tool** (“manager”, “seller”). Declared by the tool in its manifest, read by the SDK. There is no role at the Chest level. |
| **Builder** | **Member** who authored an approved tool; no global admin rights and no automatic access to business data. Can **update** their tool without new approval as long as the manifest **does not ask for more** permissions than before. Often works with a coding **agent**. |
| **End user** (usager) | Person who has (or can have) a **tool account** on a Compartment’s **public** access. **Not** a member of the Chest. |
| **Visitor** | Person on the public access without a tool account. |
| **Tool account** | Identity specific to one Compartment, for an end user. |

Shop example: **members** → private admin; **end users** → public shop account.

Do not say “shop member” for a customer: reserve **member** for the Chest.

## Spaces and access

| Term | Definition |
|---|---|
| **Chest** | A company’s software vault: portal, members, Compartments, on a dedicated VPS. Opened **empty** from central. |
| **Compartment** | A tool’s place in the Chest. Plural: Compartments. |
| **Central** | Argentic site: Owner account, subscription, provisioning (`chest.argentic.app`). |
| **Portal** | The **Chest**’s interface for **members**. Not billing. |
| **Private access** | Interface reserved for authorised **members** (roles, groups). |
| **Public access** | Internet-facing interface; **visitors** and **end users**. |

An app chooses: private only, public only, or both.

## Building

| Term | Definition |
|---|---|
| **Store / catalogue** | Argentic open-source tools, installable or forkable. |
| **Package** | Installable unit (code + manifest). Same contract for catalogue and custom tools. |
| **Manifest** | Declaration of access needs. It requests; it does not grant. |
| **SDK** | Platform primitives: member context / roles, end-user auth, files, mail, Postgres, connectors. It makes things easier; it does not secure anything on its own. |
| **Connector** | Governed access to an external service: the platform holds the secret; the tool gets bounded **capabilities**, not the key. |
| **Runtime** | **Node** first; **Python** next. |
| **Agent key** | Scoped token (member / Chest) that lets an agent call the Chest’s API: link a repo, propose, deploy according to rights. No VPS access. Revocable. |
| **GitHub link** | The member connects their GitHub to **their** Chest: a GitHub App specific to the Chest, owned by the company, read-only on the chosen repositories. On push, GitHub rings the Chest, which **fetches** the code. Neither central nor a shell on the server. |
| **Subscription** | The moment a Chest is opened, on central. Separate from any payment collected inside a tool. |
| **Tool payments** | Later: **Stripe connector** on a Compartment’s public access (shop), with the company’s Stripe account. |

## Rules tied to the vocabulary

- **Members** are invited to the **Chest**, never “to a Compartment” as a first step.
- The **Owner**: subscription on **central**; day-to-day use on the **portal**; two accounts, no relay between them after the first entry.
- The **Chest alone manages** its members’ sign-in; sign-in connectors (SSO, GitHub, Google) are plugged in by the company, not by Argentic.
- An invited **member** signs in only on the Chest.
- The **group** belongs to the Chest, the **role** to the tool. A Compartment’s access setting links them: “Sales → seller”. Inviting Camille into Sales gives her everything Sales has, without going through each tool again.
- **Roles** serve **private** access; **end users** are outside groups and roles.
- An **end user** authenticates through the SDK on the public access of *that* tool.
- **Connectors**: capabilities, not credentials in the app.
- **GitHub** = code relay; **agent key** = Chest API auth; no VPS shell.
- Owner policy: proposal by default; auto-deploy optional and bounded (manifest).
- A forked tool follows the custom path (no automatic store updates).
- **PostgreSQL**: one database per Compartment that asks for it.
- Former label “external account” = **tool account**.

## Still-open decisions

Remove from this list as soon as they are settled.

- Remaining details of sign-in and of triggering after a push — see [Open questions](../98_travail/debates.md).
- Stripe connector: exact form, receipt of Stripe notifications.
- Fine-grained rights of the **delegated admin** (beyond approving installations).
- Exact catalogue of initial **connectors**.
- Fine defaults of the **auto-deploy** policy (who can enable it, exact ceilings).
- Store of paid third-party publishers (lead).
- Offer and pricing: plans sketched in [Owner space and billing](../02_specs/owner-space-and-billing.md), prices to fix.

## Where to go next

- [How it works](../02_specs/how-it-works.md)
- [For agents](../02_specs/for-agents.md)
- [Building a tool](../02_specs/building-tools.md)
