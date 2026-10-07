-- The notes and the secrets of the team: the first migration of the server test tool,
-- played by the Chest as the tool before its first instance.
CREATE TABLE notes (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Its secrets: a label in clear, a value sealed by the Chest (the text
-- chest:sealed:1:…), opened by the tool for its members only.
CREATE TABLE secrets (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label text NOT NULL UNIQUE CHECK (label ~ '^[a-z0-9][a-z0-9.-]{0,63}$'),
  value text NOT NULL CHECK (value LIKE 'chest:sealed:1:%'),
  editors boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
