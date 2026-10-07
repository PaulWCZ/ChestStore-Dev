# Chat — the store's team messaging tool

**Specified 7 October 2026; built the same day; Paul's decisions the same
day** (at the end: notices show what a message says, the other defaults
approved), in its own repository, `03_code/04_argentic-store/chat`, to be
published as the **public** repository `chest-by-argentic/chat` (no
licence, by Paul's choice), on SDK 0.5.0 with realtime. Done and remaining in
[status.md](../03_roadmap/status.md) (row CHAT). How the code does it is in
the tool's own `README.md`.

Paul (7 October 2026): *“as advanced as Slack, with a super polished UI and
UX”*; an installable store tool, **not** a service of the Chest; **messages
sealed by default**.

Related: [Realtime](realtime.md) (its “Slack-like tool, end to end” is the
sketch this page makes real), [Sealed data](sealed-data.md) (question 6 is
answered here: everything sealed), [Members and
notifications](members-and-notifications.md), [Tool storage](tool-storage.md),
[Mail](mail.md), [Events between tools](tool-events.md).

## The decision in short

1. **A store tool**, `chat`, built on the Perseus starter's stack (Hono, React
   rendered on the server, one hydrated island, Vite), contract 0.5. A company
   installs it like any tool; the Chest keeps no messaging of its own.
2. **Every message is sealed.** Bodies, attachment names, drafts and channel
   descriptions are sealed by the Chest with the tool's key; the database, the
   Data tab, the agents' APIs, backups and Perseus see “Sealed”. What stays
   in clear is what lists, access and notifications need: ids, who wrote
   when, channel names, membership, reactions, counts.
3. **Live without polling, asleep when nobody writes.** The Chest's realtime
   holds every page; the tool is woken only by a write or a page load.
   Content never crosses the realtime service: live events carry ids, and
   each page asks the tool to open what it shows.
4. **Search opens and scans, on the member's behalf.** No index of sealed
   text exists anywhere. A search narrows in clear (conversations the member
   may read, author, dates, files), then opens pages of messages and matches
   them in memory, newest first, and says how far back it looked.
5. **Notifications through the Chest**, never by mail of its own: per
   conversation *All*, *Mentions* or *Nothing*; only members not looking at
   the tool are notified; the notice says who and where and **shows the
   message's first words**, except in a channel marked *Confidential*.
6. **Phone first-class, keyboard first-class, English then French,
   accessible (axe clean), black and white.**

## Research, and what we take

| Product | What it does well | What it does badly | We take / avoid |
|---|---|---|---|
| **Slack** | Channels, threads, `@here`/`@channel`, per-channel notification levels, drafts synced across devices, Cmd-K switcher, “Mark as unread”, saved items, pins, the unread line | A sidebar that grew sections, Huddles, Canvas, Lists, Workflows, apps; threads that hide conversations; search that needs a paid plan for history; a mobile app that is a second product | Take the core model whole. Avoid every surface beyond conversations: one sidebar, three views (Threads, Mentions, Saved), drafts in place |
| **Discord** | Instant feel: optimistic sends, typing, presence; one-key reactions; markdown | Servers, roles and permissions screens no company needs; noisy | Optimistic sends, quick reactions on hover, markdown on send. Avoid roles screens: the Chest's admins moderate |
| **Linear** | Polish: dense, quiet typography, every action on the keyboard, a command menu that finds everything, no spinners on navigation | — (not chat) | The bar for craft: instant navigation from local state, a command menu, a list of shortcuts (Cmd-/), no layout shift |
| **Microsoft Teams** | Threads by default in channels, organisation-wide directory, group chats with names | Heavy, slow, two models (chats vs channel posts) | One model only: a conversation, threads optional |
| **Mattermost** | Self-hosted Slack, permissions per team, compliance exports | Slack's UI, one step behind; dense admin console | Self-hosting is our premise already; no admin console of its own: the Chest's admins are its moderators |

Criticism kept in mind: Slack's power comes from four things — channels you
can find, threads, mentions that reach you, and search. Everything else is
optional. This tool does those four perfectly and stops there.

## What a member sees

```
┌───────────────┬──────────────────────────────────────┬───────────────────┐
│ Acme SAS      │ # design                    ★  ⓘ  ⌕  │ Thread       ✕    │
│ ⌕ Jump to…  ⌘K│ ──────────────────────────────────── │ Camille Martin    │
│               │ Tuesday 6 October                    │ The new tiles…    │
│ Threads       │ Camille Martin  14:02                │ ───────────────   │
│ Mentions    2 │ The new tiles are in Figma.          │ 3 replies         │
│ Saved         │   👍 2  ✓ 1        3 replies ›       │ Sam Taylor  14:10 │
│               │ ───── New ─────                      │ Lovely.           │
│ Channels    + │ Sam Taylor  14:10                    │                   │
│ # general     │ Reviewed, two notes in the thread.   │                   │
│ # design      │                                      │                   │
│ 🔒 board    1 │ Camille is typing…                   │                   │
│               │ ┌──────────────────────────────────┐ │ ┌───────────────┐ │
│ Direct        │ │ Message #design                  │ │ │ Reply…        │ │
│ ● Sam Taylor  │ └──────────────────────────────────┘ │ └───────────────┘ │
└───────────────┴──────────────────────────────────────┴───────────────────┘
```

- **Sidebar**: the organisation's name; *Jump to…* (Cmd-K); **Threads**,
  **Mentions**, **Saved** (Drafts appear as a fourth line only while drafts
  exist); **Channels** (starred first, then by name; `#` public, a lock
  private; *+* creates or browses); **Direct messages** (by last activity,
  a filled square for someone active, a hollow one for someone away). An
  unread conversation is written in ink with a small square, a read one in
  grey; a count says mentions (in a direct conversation, every unread
  message is one). The conversation open is marked by a rule and paper
  grey. States are words and weight of ink, never colour.
- **Conversation**: header (name, star, how many members, search in it,
  details), messages
  grouped by author within five minutes, day dividers (“Today”,
  “Yesterday”, “Monday 5 October”), the **New** line at the first unread,
  reactions, thread summary (“3 replies · last at 14:10”), files and images
  inline, an edited mark, a pin mark. A message's actions on hover (and on a
  long press on a phone): react, reply in thread, save, more (edit, delete,
  pin, copy link, mark unread).
- **Composer**: markdown (`*bold*`, `_italic_`, `~strike~`, `` `code` ``,
  fenced blocks, `>` quotes, lists), `@` for people and `@channel`/`@here`,
  `#` for channels, `:` for emoji, files by button, paste or drop. Enter
  sends, Shift-Enter breaks the line; a draft is kept per conversation and
  thread, on every device.
- **Thread** opens beside the conversation (full screen on a phone).
- **Details**: about (description), members (add people or a group, remove),
  pinned messages, notifications (*All new messages* · *Mentions* ·
  *Nothing*), leave, rename, archive.
- **Views**: *Threads* (threads the member follows, latest reply first,
  the unread ones marked), *Mentions*
  (messages that mention them or `@channel`), *Saved*, *Drafts*, *Search*.
- **Phone** (under 768 px): one pane at a time — list, conversation, thread
  — with a back button; the composer stays above the keyboard; actions in a
  sheet on long press.
- **Light and dark**, by the device's setting: white paper and black ink, or
  the reverse. Argentic blue only for focus.

### Keyboard

| Keys | Does |
|---|---|
| Cmd/Ctrl-K | Jump to a conversation or a person |
| Cmd/Ctrl-G | Search |
| Alt-↑ / Alt-↓ | Previous / next conversation |
| Alt-Shift-↑ / Alt-Shift-↓ | Previous / next unread conversation |
| Esc | Close the thread or panel; in a conversation, mark it read |
| ↑ in an empty composer | Edit your last message |
| Enter / Shift-Enter | Send / new line |
| Cmd/Ctrl-/ | The list of shortcuts |

## Conversations

| Kind | Who sees it | Who joins | Who manages |
|---|---|---|---|
| **Public channel** | Every member who has the tool (browse, preview, search) | Anyone, by *Join*; the default channel `#general` by everyone at their first visit | Its creator and the Chest's admins rename and archive; any member of it describes it and adds people |
| **Private channel** | Its members only | Added by a member, alone or as a **group of the Chest** (`members.groups`) | As public; removing someone: its creator, the admins, or themselves (*Leave*) |
| **Direct message** | Its 1 to 9 people (yourself alone is a note to self) | Fixed at creation: adding someone makes another conversation, as Slack | Nobody: it cannot be renamed nor archived |

- **Groups as audiences.** A private or public channel may be given to a
  group: its members join, those who later enter the group join, those who
  leave it leave the channel at once (the Chest's `member.updated` event),
  unless they were also added in person.
- **Names**: lowercase letters, digits, `-` and `_`, 1 to 80 characters,
  unique across channels. Channel names are in clear (lists, the switcher,
  uniqueness); a channel's description is sealed.
- **Archive**: read-only, out of the sidebar, still found by search and
  Browse; unarchived by its creator or an admin.
- **Moderation**: the Chest's admins (and owner) may delete any message and
  manage any channel **they can see** — every public channel, the private
  ones they are in. A private conversation stays private from admins too.
  There is no moderation console.
- **Leaving the Chest or the tool**: the member's messages stay with their
  name (“Camille Martin (former member)”); their access goes at once (the
  Chest closes their pages). **Erasure** (`member.erased`) deletes their
  messages' bodies, files, reactions, drafts, saved items and memberships,
  then acknowledges it.

## Messages

- Text up to **40,000 characters** (Slack's bound); markdown rendered as
  text by the tool's own parser — never HTML from a member.
- **Mentions** are stored as tokens (`<@mbr_…>`, `<#id>`, `<!channel>`,
  `<!here>`), shown with the current name. Only the conversation's members
  are mentioned: a name outside it reaches nobody. `@here` reaches the
  members active in Chat when it is sent; `@channel` all of them.
- **Edits** change the text and its mentions; they notify nobody, and may
  take `@channel` or `@here` out, never add them.
- **Edit** (the author), **delete** (the author or an admin): a deleted
  message with replies leaves “This message was deleted.”; one without
  disappears.
- **Reactions**: any emoji, one per member and emoji; the picker offers the
  common ones with their names, searchable in both languages.
- **Threads**: a reply belongs to its root; the root shows the count, the
  last time and who replied. Writing in a thread, or being mentioned in it,
  follows it; *Unfollow* stops.
- **Pins** (any member of the conversation; the details show the last 100,
  as Slack), **Saved** (per member).
- **Threads** open on their latest 50 replies, older ones on scrolling up.
- **Unread**: per conversation, the last message read; per followed thread
  the same. *Mark unread* from any message moves it back; reading on one
  device clears the others at once.
- **System lines** (“Camille joined”, “Sam renamed the channel #design”)
  are written by the tool, in clear: they hold no member's words.
- **Links**: written links become links (`https`, `http`, `mailto` only),
  opened in a new tab without referrer. **No link previews**: they would
  need the tool to fetch any address on the Internet (a `network`
  permission of `*`) and would put a sealed message's link in clear outside.

## Files

- Attach by button, paste or drop, **10 at a time, 100 MiB each** (the
  manifest asks `"files": {"quota": "10 GiB", "maxObject": "100 MiB"}`): the
  browser sends the bytes **to the Chest**, never through the tool
  (`files.uploadUrl` into a folder: the Chest names the object).
- Images show as 256 px thumbnails (1,024 px when opened), other files as a
  line: type, size, *Download*. Links are signed for 15 minutes and given
  only to members who can read the conversation.
- The file's **name is sealed**; its object name is the Chest's random one.
- **Not sealed: the bytes.** The Chest does not seal files yet
  ([sealed data, question 4](sealed-data.md#pauls-questions)): the owner's
  and admins' **Storage** view can preview an attachment. Said in the
  tool's description; sealed files are the first SDK gap below.
- Uploaded but never sent: removed by a nightly schedule after a day. A
  member has at most 20 files waiting to be sent (what a conversation's
  and a thread's composers hold): uploads nobody sends cannot fill the
  tool's space.

## Sealing

| Value | Sealed | Context (binds it to its row) |
|---|---|---|
| Message body | yes | `m:<message id>` |
| Attachment name | yes | `f:<object name>` |
| Draft | yes | `d:<member>:<conversation>:<thread>` |
| Channel description | yes | `about:<conversation id>` |
| Channel name, kind, members, groups | no — lists, uniqueness, access | — |
| Author, times, thread, mentions, reactions, pins, saved, reads | no — unread, notifications, search filters | — |

- A message is sealed with the id it will have (taken from its sequence
  first), so a sealed body copied into another row opens nowhere.
- Pages open what they show in **one call per page** (`openMany`): the 50
  messages of a page, a thread, a search chunk. A value the member may not
  open renders as “This message can't be shown.”, never a crash.
- `SealedLocked` (a restored Chest waiting for its owner's code) shows the
  Chest's sentence in place of messages: *“Messages are locked until the
  owner enters the recovery code in Settings.”* Writing is refused with the
  same words.
- **What sealing does not hide** — said in the description the owner
  approves (*“Every message is sealed; who writes where and when is not,
  nor are files yet.”*): who talks to whom, when, in which channel, how
  often, reactions. The same metadata Slack Enterprise Key Management
  leaves in clear.

## Live updates

The manifest's `realtime`:

| Channel | Rule | Carries |
|---|---|---|
| `everyone` | every member who has the tool, presence | who is active (`{away: false}`) or away (page hidden) |
| `c:{id}` | the membership table `conversation_members` (a row removed kicks at once); `send` | the feeds below; members' `typing` (`peers`, at most every 3 s) |

| Feed | Table → channel | Columns (never a body) |
|---|---|---|
| Messages | `messages` → `c:{conversation_id}` | id, conversation, thread, author, kind, mentions and `@channel`, times (created, edited, deleted, pinned), reply count and last reply |
| Reactions | `reactions` → `c:{conversation_id}` | message, emoji, member |

- A page joins `everyone` and **every conversation its member is in**,
  and says which one is on screen (`live.focus`). A `messages` feed event
  moves that conversation's unread and mention counts in the sidebar (its
  author, thread and mentions say whether it counts, nothing of the text);
  in the conversation shown, it makes the page fetch the message (`GET
  /chest/api/messages?ids=`, opened for that member), batched by the
  frame.
- **What no feed says** comes as a direct event (`realtime.send`) to the
  members concerned, ids only: `thread` (a reply in a thread the member
  follows), `read` (another device of theirs read it), `conversations`
  (added, removed, renamed).
- Feeds and the Chest's own events reach `on`, `onJoined`, `onResync`,
  `onKicked`, `onRefused`; other members' messages reach `peers` only, and
  are only ever `typing`: no member can speak as the Chest.
- Reconnecting replays what was missed (the feeds' rows of the last 7
  days); a `resync`, or a join that was not replayed, refetches the state:
  the database is the truth.
- **Access removed** (Team, or a membership row deleted) closes or leaves at
  once; the page says the Chest's sentence.
- **Sleep**: typing, presence and open pages cost the tool nothing; a quiet
  afternoon sleeps it, the next message wakes it (≈ 0.5 s, once).

## Search

Sealed text cannot be indexed on the server, and must not be on the device.
The choices weighed:

| Option | What it gives | Why |
|---|---|---|
| (a) Search what the page has loaded | Instant, nothing new | Misses everything not on screen: not search |
| **(b) Open and scan, on the member's request** — chosen | Exact words anywhere the member may read, newest first, filters in clear | Every message scanned is an open journaled for that member — honest: searching is reading. Cost measured below |
| (c) An index in the browser (IndexedDB) | Fast after a first sync | Plain text of every conversation on the device: the Chest keeps nothing private on a device ([§ 9](members-and-notifications.md#the-chest-as-an-app)), a lost laptop leaks history |
| (d) A blind index of words (HMAC of each word) | Fast equality on words | Leaks which messages share words and, by dictionary, the words; needs a keyed hash the Chest does not offer ([sealed data, question 5](sealed-data.md#pauls-questions)) |
| (e) Keep messages in clear and seal only confidential channels | Full-text search, AI | Paul chose sealed by default |

**How (b) works.** The query is words and filters (`in:#design`,
`from:@Sam`, `has:file`, `is:thread`, `before:2026-10-01`,
`after:2026-09-01`, also as chips). The tool selects, in clear, messages of
conversations the member may read (their own, and every public channel)
that pass the filters, newest first, in chunks; opens each chunk in one
call; keeps those containing every word (case and accent insensitive);
stops at 20 results, or once it has looked through 5,000 messages, 16 MB of
them or 2 seconds; a member's searches run one at a time. The answer says
how far back it looked: *“Searched back to 12 March. Search older
messages.”* — the next call continues from there.

Measured on the Mac (the tool, PostgreSQL in Docker, the SDK's fake Chest
sealing in the same process): 5,000 sealed messages of 30 words looked
through, nothing found, in 0.10–0.14 s from request to answer; a word
found in the latest messages answers in 7 ms. A Chest's sealing service
opens a value in about 1 µs, one call per 200 messages.

The switcher (Cmd-K) and Browse search names in clear: instant.

## Notifications, badges

- Per conversation: **All new messages** (default for direct messages),
  **Mentions** (default for channels), **Nothing** (muted: no notice, no
  ink, no badge). Threads one follows notify on every reply unless the
  conversation is *Nothing*.
- **Only members not watching the conversation** are notified:
  `realtime.online(members, {channel: "c:<id>"})` says who has it on screen
  (a page focused on it, in the foreground) — they see it come. Chat closed,
  a hidden tab, a phone in a pocket, or Chat open on another conversation:
  notified. `@here` mentions the members with Chat open.
- **What a notice says** (Paul, 7 October 2026: *“when we receive a
  notification we want to see what it is”*): the title says who and where —
  “Camille Martin in #design”, “Camille Martin mentioned you in #design”,
  “Camille Martin” for a direct message (French: “Camille Martin dans
  #design”, “… vous a mentionné dans #design”) —; the body is **a preview of
  the message**: its text, plain (formatting gone, mentions and public
  channels named, lines joined), the first 120 characters or so, cut
  between two words (“…”). A message of files only says “New message” /
  “Mentioned you”. The link opens the message. One item per conversation
  and per thread (`key`), replaced by the next, **withdrawn when read**.
- **The preview leaves the seal.** The tool has the words in clear when
  their author posts them, and hands the preview to the Chest's notice: it
  is then kept **in clear** in the Chest's notification store (the bell),
  carried by the **mail relay** and kept by **the recipient's mail host**
  when the member gets their notifications by mail ([Mail](mail.md)). A
  **push** is encrypted end to end for the device. Members choose mail and
  push in their Chest profile; a channel can refuse the preview:
- **Confidential channels.** In a channel's details, *Confidential: no
  preview in notifications* — off by default, set by those who manage the
  channel (its creator and the Chest's admins). Its notices say only who and
  where: “Camille Martin in #board” and “New message” / “Mentioned you”; no
  word of its messages leaves the seal. Direct messages have no such switch
  and show the preview.
- **Badge** on the tool's tile: unread direct messages plus unread mentions,
  as Slack's dock badge; muted conversations count nothing.

## Events

- **Receives** `member.*`: `member.updated` with groups changed re-computes
  that member's group channels at once; `member.erased` erases (above);
  `access.revoked` and `member.removed` need nothing (the Chest cuts them,
  names stay as former).
- **Emits nothing yet.** `message.posted {conversation, message, author}`
  would let an automation react to a message in a channel (a support channel
  feeding Helpdesk) without its text; it waits for events between tools to
  merge (Chest PR #269, SDK PR #28) and for a first receiver.

## Manifest

```jsonc
{
  "chest": "0.5",
  "name": "chat",
  "title": "Chat",
  "capabilities": ["database", "files", "members", "members.groups", "notifications", "realtime", "sealed"],
  "files": { "quota": "10 GiB", "maxObject": "100 MiB" },
  "receives": ["member.*"],
  "schedules": [{ "name": "tidy", "cron": "30 3 * * *" }],
  "realtime": { "channels": […], "feeds": […] }   // above
}
```

No `network`, no `public`, no `ai`, no roles: every member is a member; the
Chest's admins moderate.

## Memory and size

The bar: at rest, no more than the starter. Measured on the Mac (Node 22,
the built server started as the Chest starts it, its resident size three
seconds after start; `npm run memory` in the tool, the same script on the
Perseus starter): **Chat median 79.0 MiB (76.8–81.8 over six runs), the
starter 77.5 MiB (76.2–80.1)** — about 1.5 MiB more at the median,
within the spread between two runs of one server, so not strictly below
the bar. Chat's code, PostgreSQL client and SDK modules add about 4 MiB;
a lighter router (`hono/tiny`) and a minified server take back 2.5. A
measurement on Linux (the Chest's) is still to do. How it measures and what
happens under load: the tool's `README.md`, *Memory*.

## SDK and Chest gaps found

Written down, not worked around:

1. **Sealed files.** Attachments' bytes are in clear in the tool's files
   (Storage view previews them). Needs [sealed data question
   4](sealed-data.md#pauls-questions): `files.uploadUrl(name, {sealed: true})`
   and sealed links served only to a member's ticket.
2. **A notice for a sealed message.** A notification's text is stored and
   mailed in clear, so a preview leaves the seal (above). A
   `notify({sealed: true})` whose body the Chest keeps sealed, opens only in
   its member's bell and leaves out of mails would keep the preview inside
   the seal.
3. **Search on sealed text** costs one open per message scanned. A keyed
   word index the Chest holds (sealed data question 5) would make search
   instant; its leaks must be weighed first.
Resolved in SDK 0.5.0 as merged (Chest-SDK PR #30, Chest PR #271), and
used by the tool since: a page joins as many channels as its member has;
`live.focus` and `realtime.online(…, {channel})`'s `watching` tell the tool
who has a conversation on screen, for it alone; members' messages travel
apart (`peers`, names without dots) from the Chest's events; the fake
Chest commits a feed's row whole, to every feed of its table.

## Paul's decisions (7 October 2026)

1. **Notices show what the message says**: a preview of about 120
   characters in the bell, push and mail; a channel's managers can mark it
   *Confidential* to keep its notices to who and where; direct messages
   always show it. The trade-off is stated above (*The preview leaves the
   seal*). Withdrawn on read, as before.
2. **Search scope**: every public channel and the member's own
   conversations, as Slack.
3. **Attachments in clear** until sealed files exist, said in the
   description.
4. **Private channel names in clear** (lists, uniqueness).
5. **Retention**: kept until deleted.
6. **Who may create channels**: every member.
7. **Admins moderate what they can see**: private conversations stay
   private from them too.
8. **Repository**: `chest-by-argentic/chat`, public, created and pushed by
   Paul once the SDK's realtime is on `main` and re-vendored; no licence
   until the owner chooses one.
