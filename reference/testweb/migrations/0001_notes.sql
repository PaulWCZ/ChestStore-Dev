-- The notes of the team: the first migration of the server test tool,
-- played by the Chest as the tool before its first instance.
CREATE TABLE notes (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
