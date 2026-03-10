-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates the user_data table for persisting all app data per user.

CREATE TABLE IF NOT EXISTS user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, data_key)
);

-- Enable Row Level Security so users can only access their own data
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data" ON user_data
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own data
CREATE POLICY "Users can insert own data" ON user_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON user_data
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own data
CREATE POLICY "Users can delete own data" ON user_data
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups by user + key
CREATE INDEX IF NOT EXISTS idx_user_data_lookup ON user_data(user_id, data_key);
