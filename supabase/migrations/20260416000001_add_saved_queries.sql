-- Add a saved_queries table so users can bookmark NLQ questions they want to re-run.
-- Each row is one saved question belonging to one user.
-- RLS ensures users can only see and manage their own saved queries.

CREATE TABLE IF NOT EXISTS saved_queries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question   text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;

-- Single policy covers SELECT, INSERT, UPDATE, DELETE for the owning user
CREATE POLICY "Users can manage own saved queries"
  ON saved_queries FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_queries_user
  ON saved_queries(user_id, created_at DESC);
