-- The chat of the team: who is in each room — the membership table of the
-- live channel room:{id} — and what is written there — its feed. The
-- Chest's realtime reads both (chest.json, "realtime").
CREATE TABLE chat_members (
  room integer NOT NULL CHECK (room > 0),
  member_id text NOT NULL,
  PRIMARY KEY (room, member_id)
);
CREATE TABLE chat_messages (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room integer NOT NULL CHECK (room > 0),
  author text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now()
);
