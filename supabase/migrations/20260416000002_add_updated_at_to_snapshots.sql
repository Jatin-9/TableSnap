-- Add updated_at to table_snapshots so we can track when a table was last edited.
-- A trigger keeps the column in sync automatically on every UPDATE — no app-level
-- code needs to remember to set it.

ALTER TABLE table_snapshots
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Back-fill existing rows: use their created_at as the starting point
UPDATE table_snapshots
  SET updated_at = created_at
  WHERE updated_at IS NULL;

-- Trigger function: fires before any UPDATE and stamps the current time
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to table_snapshots
CREATE TRIGGER trigger_snapshots_updated_at
  BEFORE UPDATE ON table_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
