-- Replace the saved_queries bookmark table with a full chat_sessions table.
-- Each session stores the entire conversation as a JSONB array of messages,
-- so users can resume past chats exactly where they left off — like ChatGPT/Claude.

DROP TABLE IF EXISTS saved_queries;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Auto-title is set from the first user message (first 60 chars).
  -- Defaults to 'New chat' in case of an unexpected insert without a title.
  title           text        NOT NULL DEFAULT 'New chat',
  -- Full conversation history as [{ role, content }, ...].
  -- Stored as JSONB so we can append/replace without extra tables.
  messages        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  message_count   integer     NOT NULL DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- One policy covers all operations — users can only touch their own sessions
CREATE POLICY "Users can manage own chat sessions"
  ON chat_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index on (user_id, last_message_at DESC) so loading the session list is fast
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON chat_sessions(user_id, last_message_at DESC);
