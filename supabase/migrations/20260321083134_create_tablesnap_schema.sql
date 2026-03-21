/*
  # TableSnap Database Schema

  ## Overview
  Complete schema for TableSnap - Universal OCR Table Organizer with role-based access and analytics.

  ## New Tables
  
  ### 1. `users`
  Extended user profile with role management
  - `id` (uuid, primary key) - Links to auth.users
  - `email` (text, unique, not null)
  - `role` (text, not null) - 'user' or 'super_admin'
  - `created_at` (timestamptz)
  - `preferences` (jsonb) - User settings and preferences
  
  ### 2. `table_snapshots`
  Stores OCR-extracted tables with metadata
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to users)
  - `table_data` (jsonb) - Actual table content as JSON array
  - `column_names` (text array) - Column headers
  - `auto_tags` (text array) - AI-generated tags
  - `ocr_confidence` (decimal) - Confidence score 0-100
  - `row_count` (integer) - Number of rows
  - `column_count` (integer) - Number of columns
  - `created_at` (timestamptz)
  
  ### 3. `user_analytics`
  Individual user analytics tracking
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to users)
  - `date` (date, not null)
  - `tables_created` (integer)
  - `rows_added` (integer)
  - `tags_used` (jsonb) - Tag usage counts
  - `updated_at` (timestamptz)
  
  ### 4. `global_analytics`
  Platform-wide analytics for super admin
  - `id` (uuid, primary key)
  - `date` (date, not null, unique)
  - `total_users` (integer)
  - `active_users` (integer)
  - `tables_created` (integer)
  - `total_rows` (integer)
  - `top_tags` (jsonb) - Popular tags across platform
  - `updated_at` (timestamptz)

  ### 5. `reminders`
  User reminder configurations
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to users)
  - `frequency` (text) - 'daily' or 'weekly'
  - `delivery_method` (text) - 'email' or 'notification'
  - `enabled` (boolean)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Super admins can access global analytics
  - Policies for authenticated users only
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'super_admin')),
  created_at timestamptz DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create table_snapshots table
CREATE TABLE IF NOT EXISTS table_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  auto_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ocr_confidence decimal(5,2) DEFAULT 0.00,
  row_count integer DEFAULT 0,
  column_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE table_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON table_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
  ON table_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots"
  ON table_snapshots FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshots"
  ON table_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_table_snapshots_user_id ON table_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_table_snapshots_created_at ON table_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_snapshots_tags ON table_snapshots USING GIN(auto_tags);

-- Create user_analytics table
CREATE TABLE IF NOT EXISTS user_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  tables_created integer DEFAULT 0,
  rows_added integer DEFAULT 0,
  tags_used jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics"
  ON user_analytics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_analytics_user_date ON user_analytics(user_id, date DESC);

-- Create global_analytics table
CREATE TABLE IF NOT EXISTS global_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_users integer DEFAULT 0,
  active_users integer DEFAULT 0,
  tables_created integer DEFAULT 0,
  total_rows integer DEFAULT 0,
  top_tags jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE global_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view global analytics"
  ON global_analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_global_analytics_date ON global_analytics(date DESC);

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  delivery_method text NOT NULL CHECK (delivery_method IN ('email', 'notification')),
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders"
  ON reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders"
  ON reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update analytics when a snapshot is created
CREATE OR REPLACE FUNCTION update_analytics_on_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user analytics
  INSERT INTO user_analytics (user_id, date, tables_created, rows_added, tags_used)
  VALUES (
    NEW.user_id,
    CURRENT_DATE,
    1,
    NEW.row_count,
    jsonb_object(ARRAY(SELECT unnest(NEW.auto_tags)), ARRAY(SELECT 1 FROM unnest(NEW.auto_tags)))
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    tables_created = user_analytics.tables_created + 1,
    rows_added = user_analytics.rows_added + NEW.row_count,
    tags_used = user_analytics.tags_used || EXCLUDED.tags_used,
    updated_at = now();

  -- Update global analytics
  INSERT INTO global_analytics (date, tables_created, total_rows, top_tags)
  VALUES (
    CURRENT_DATE,
    1,
    NEW.row_count,
    jsonb_object(ARRAY(SELECT unnest(NEW.auto_tags)), ARRAY(SELECT 1 FROM unnest(NEW.auto_tags)))
  )
  ON CONFLICT (date)
  DO UPDATE SET
    tables_created = global_analytics.tables_created + 1,
    total_rows = global_analytics.total_rows + NEW.row_count,
    top_tags = global_analytics.top_tags || EXCLUDED.top_tags,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_analytics
AFTER INSERT ON table_snapshots
FOR EACH ROW
EXECUTE FUNCTION update_analytics_on_snapshot();

-- Function to update global user counts
CREATE OR REPLACE FUNCTION update_global_user_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO global_analytics (date, total_users, active_users)
  VALUES (
    CURRENT_DATE,
    (SELECT COUNT(*) FROM users),
    (SELECT COUNT(DISTINCT user_id) FROM table_snapshots WHERE created_at >= CURRENT_DATE)
  )
  ON CONFLICT (date)
  DO UPDATE SET
    total_users = (SELECT COUNT(*) FROM users),
    active_users = (SELECT COUNT(DISTINCT user_id) FROM table_snapshots WHERE created_at >= CURRENT_DATE),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_count
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION update_global_user_count();