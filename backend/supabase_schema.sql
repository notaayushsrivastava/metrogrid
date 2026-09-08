-- MetroGrid Supabase Database Schema
-- Run this in your Supabase project SQL Editor to create the city_plans table

CREATE TABLE IF NOT EXISTS public.city_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  grid_state JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.city_plans ENABLE ROW LEVEL SECURITY;

-- Create policy allowing full read/write for authenticated and anonymous prototype access
CREATE POLICY "Allow public read/write to city_plans"
ON public.city_plans
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for ordering by creation time
CREATE INDEX IF NOT EXISTS idx_city_plans_created_at ON public.city_plans (created_at DESC);

