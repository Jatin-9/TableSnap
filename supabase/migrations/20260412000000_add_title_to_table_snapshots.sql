-- Add an optional "title" column to table_snapshots.
-- This lets users give their tables a human-friendly name instead of
-- just seeing column names displayed as the title.
-- We make it nullable so existing rows are not affected — the UI will
-- fall back to showing column names when title is NULL.

ALTER TABLE table_snapshots
  ADD COLUMN IF NOT EXISTS title text;
