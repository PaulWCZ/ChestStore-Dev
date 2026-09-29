-- My due dates in each member's Chest calendar (Proposal (studio):
-- "calendar"). What was put, so a change puts again and a card done,
-- archived, deleted or taken from someone takes the event back.
--
-- key: "card:<id>" or "step:<id>" (the event's key at the Chest). No
-- foreign key: a deleted card's event must still be taken back.
-- raw: a fingerprint of what the event is made of (title, dates, board,
-- who is on it, who sees the board); members: those it was put for, after
-- checking each one sees the board (a private board's people and groups).
create table calendar_events (
  key text primary key check (key ~ '^(card|step):[0-9]{1,19}$'),
  raw text not null,
  members text not null,
  put_at timestamptz not null default now()
);

-- Whether the Chest took the last event ("calendar": yes / no), so the page
-- promises the calendar only when there is one.
create table tool_state (
  key text primary key check (key ~ '^[a-z_]{1,32}$'),
  value text not null check (char_length(value) <= 200),
  updated_at timestamptz not null default now()
);
