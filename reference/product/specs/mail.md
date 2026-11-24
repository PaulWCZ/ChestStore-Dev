# Mail

**Decided by Paul on 6 October 2026; built in Chest PR #267.** How the code
does it is in `03_code/01_chest-by-argentic/docs/architecture.md`
(“Relayed sign-in mails”, “The mails of notifications”); done and
remaining in [status.md](../03_roadmap/status.md) (rows C, G, N, ML).

There are two kinds of mail, and the Chest treats them in two different ways:

| Mail | Whose | How |
|---|---|---|
| A member's **notifications** (a leave to approve, a task due, a builder's request) | **The Chest's service**, like the invitation and the sign-in code | the tool notifies (`notify`, `broadcast`); the Chest mails each member as they chose; the central relay writes it in the brand layout |
| **Mail to the public** from a tool (a booking recap, a quote, a form's receipt) | **The company's**, later, through an SDK `mail` send and a connector to its own provider | never sent by Argentic; the Chest receives no mail: § 5 |

## 1. Notifications by mail: the Chest's service

A tool does nothing for it: no SDK call, no capability, no manifest key, no
`notifications.mail`. It notifies as it always did (`notify`, and
`broadcast` once groups ship, [Members and
notifications](members-and-notifications.md)); the Chest decides the mail.
The mail is sent through the central relay, like the invitations, and is
written by the central from a fixed template, in the layout of every mail
(`common/mailhtml`).

Why the Chest and not the tool: every tool would otherwise rebuild the same
preference, the same retries and the same letters. A member of six tools
would get mails from six senders, each with its own switch. A muted tool
could still mail. The tool would need members' addresses. GitHub and Linear
do it the same way: the product keeps the notification, the person chooses
how it reaches them.

## 2. What the member chooses

**Profile → Notifications → Email**, four choices, each a plain chip like
the rest of the profile (beside it, **Push on this device**, the other way
the Chest brings a member their notifications: [Members and notifications
§ 9](members-and-notifications.md#9-on-the-phone-the-chest-installed-and-push)):

| Choice | What the member receives |
|---|---|
| **Every notification** (the default) | one mail per notification, as it comes; a burst is gathered (§ 3) |
| **Once a day** | a summary at 8:00 in their time zone |
| **Twice a day** | a summary at 8:00 and at 16:00 in their time zone |
| **Off** | nothing; the bell only |

- **Per tool.** The tool rows of the same section keep their “Notify me”
  switch. A tool switched off sends the member nothing, neither in the bell
  nor by mail.
- **What is mailed.** Only notifications still unread, never mailed
  before, and less than a day old. A notification read in the Chest in
  time is never mailed. A new choice starts from now: switching never
  mails the backlog.
- **The link of every mail** leads to the same four choices on the Chest,
  without signing in. The link is signed: an HMAC of the member under a key
  of the Chest.
  - Opened in a browser, it shows the choices, so a link scanner changes
    nothing.
  - One choice posted is kept.
  - The same link is the mail's one-click unsubscribe (RFC 8058,
    `List-Unsubscribe-Post`): a mail application that posts it turns the
    mails off.
- Agents and tools never see or change the choice.

## 3. Content and volume

**One notification, one mail:**
- subject: the tool and the title (“Leave: Camille asks for 3 days off”);
- body: the title, the text, and a button “Open in Leave” to the
  notification's page on the tool's team host;
- footer: why the mail came (“as you chose in your profile: every
  notification”), the link to the choices, the signature.

**Several, one mail:** this is a burst gathered, or the summary of a day or a
half day.
- subject: “5 notifications in the Chest “Acme SAS””;
- body: each notification with its tool, its title as a link to it and its
  text, at most 10 listed and how many more wait, and a button “Open the
  Chest”;
- footer: the same.

**The Chest's own requests** (a member asks to become a builder, a version
to approve) are mailed the same way, titled in the member's language, and
lead to the Chest.

**The fixed-template rule holds.** No tool HTML. The title and text are
plain escaped text, as the inbox keeps them (80 and 280 characters, no
control or direction character). The central checks them again, and its
links lead only to that Chest and its tools' team hosts (it derives
`https://<tool>-chest.<chest>.<domain>` itself). Words are in the member's
language; a notification's text is in the language the tool wrote it in, or
the member's when the tool gave translations (`translations`, batch GRP).

**Privacy.** Showing the text is more useful but puts business content in
mail (the central, the provider, the member's mail host). That is the
trade-off of GitHub and Linear, and the member can choose Off.

**Volume, by capacity and fairness, never an arbitrary count:**
- **A burst is one mail.** As they come, the mail leaves once no new
  notification came for a minute, or five minutes after the first. A
  member receives at most one mail a minute from a Chest, and the central
  enforces that gap.
- **A tool's flood is one line.** Beyond a normal pace, a tool's
  notifications to a member are folded into its one grouped item of their
  inbox ([members and notifications § 7](members-and-notifications.md#7-the-chests-groups-and-telling-many-at-once)):
  a mail shows it as one line — “New notifications: 37” and the latest —,
  and the next mail again if more came since.
- **Sign-in mails always first.** Notification mails take at most three
  quarters of the service's hourly and daily windows; codes, invitations
  and resets keep the rest. They never take a Chest's 40 connection mails.
- **Fairness.** In a window, each Chest that sends notification mails gets
  an equal part of that share.
- **Nothing is lost.** A mail refused for a quota is tried again after the
  one-minute gap; a central unreachable, five minutes later. What it would
  have shown goes in the next mail.
- A summary leaves within four hours of its slot. A Chest that could not
  reach its central all morning waits for the next slot; it never sends at
  night.

## 4. Security

- Every boundary validates again:
  - the Chest checks a tool's notification (`toolnotify`);
  - the central checks the Chest's request (template, fields, notices
    equal to their cleaned form, links of that Chest);
  - the SMTP writer refuses a line break in a header.
- The link to the choices reads no session; its HMAC is its only authority.
  It only sets that member's choice. The portal grants an anonymous route of
  its own an explicit `AnyOrigin`, because a mail application's one-click
  post carries no Origin.
- Journals name a recipient by the digest of the address, never the
  address, never a body.

## 5. Mail to the public: later, through a connector

Mail to people outside the Chest is a real need: a person who books gets a
recap, a quote is sent by mail, a form sends a receipt. It will come
**later, through an SDK `mail` send backed by a connector to the company's
own mail provider** (row G of [status.md](../03_roadmap/status.md)). It is
not built now.
- **Never sent by Argentic.** The connector sends through the company's
  provider.
- **No mail server in the Chest.** Why not: [Mail for tools — a mail server
  in the Chest, or a connector?](../../98_travail/mail-service-options-2026-10.md)
  (memory on the server, deliverability from a VPS address).
- **Only to the public.** A mail to a member is a notification (§ 1).

The needs it must meet, from the store's tools:

| Need | What the send carries | Examples |
|---|---|---|
| **Recipient** | one outside address, given by the person in the tool (never a member's: a member is notified) | the booker, the client of a quote, the respondent of a form |
| **Purpose** | why the tool mails the public, approved by the owner with the connector | “Booking confirmations to the people who book” |
| **Recap content** | a subject and plain text in the company's name; one link back to the tool's public part at most | the booking's date, room and host; the quote's total; the form's answers |
| **Calendar file** | one `.ics` attachment (`text/calendar`) | a booking added to the booker's calendar |
| **Document** | one PDF attachment | the quote, the invoice |
| **Reply-To** | the company's own address | replies land in the company's mailbox |

**The Chest receives no mail, ever.** A tool that wants replies sets the
company's own address as Reply-To. That is the whole inbound design.

## 6. What the studio changes

The studio's `mail` module (`sdk/client/src/mail.ts`, 0.3.1-studio) is a
prototype of needs, not the contract. **Only mail to members changes, now:**

1. **Every `mail.send({to: {member}})` becomes `notify` or `broadcast`.**
   This covers Tasks, Goals, Expenses, Wiki, News, Timesheets, Leave, Rooms,
   Equipment, Polls, Forms' alerts to members and Hiring's notes to
   colleagues. Each gets a `key` and a `path`, and its letters, its 15-minute
   mail retries and its email switches are deleted. The Chest mails members
   as they choose.
2. **Remove `Member.mailPreference`.** The member's choice is the Chest's,
   and no tool reads it.

**Mail to the public stays, as a need.** It covers:
- Booking's recap to the booker (with its `.ics`);
- the quote sent to a client;
- Forms' receipt to a respondent;
- Status' updates to subscribers;
- Hiring's messages to candidates;
- Support's answers;
- People's welcome before the first day.

The studio keeps these features and their texts, and switches them to the
SDK's `mail` send once the connector exists (§ 5). It drops only the
inbound parts (`mailboxes`, `/chest-mail`, reply threads): replies go to the
company's own address, set as Reply-To.
