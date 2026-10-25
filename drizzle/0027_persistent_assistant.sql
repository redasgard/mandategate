CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_user_time_idx ON assistant_messages(user_id,created_at DESC);
