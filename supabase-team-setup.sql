-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates a team_data table for sharing data across team members.

CREATE TABLE IF NOT EXISTS team_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL,
  data_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, data_key)
);

-- Enable RLS
ALTER TABLE team_data ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read team data (they need to know the team_id)
CREATE POLICY "Authenticated users can read team data" ON team_data
  FOR SELECT TO authenticated USING (true);

-- Any authenticated user can insert team data
CREATE POLICY "Authenticated users can insert team data" ON team_data
  FOR INSERT TO authenticated WITH CHECK (true);

-- Any authenticated user can update team data
CREATE POLICY "Authenticated users can update team data" ON team_data
  FOR UPDATE TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_team_data_lookup ON team_data(team_id, data_key);
