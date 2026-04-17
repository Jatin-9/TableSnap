-- Tracks every AI query a user sends.
-- Counting rows for the current month server-side prevents client-side spoofing.
CREATE TABLE IF NOT EXISTS chat_queries (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Index so the monthly count query (WHERE user_id = ? AND created_at >= ?) is fast
CREATE INDEX IF NOT EXISTS chat_queries_user_month
  ON chat_queries (user_id, created_at);

-- Row-level security: users can only read/insert their own rows
ALTER TABLE chat_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own chat queries"
  ON chat_queries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own chat queries"
  ON chat_queries FOR SELECT
  USING (auth.uid() = user_id);
