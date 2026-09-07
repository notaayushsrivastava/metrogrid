-- MetroGrid database schema (PRD §17).
-- Run this against your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/idhqejtknqdmsbtoihtk/sql/new

create table if not exists public.city_plans (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    grid_state  jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

-- Index for chronological ordering
create index if not exists city_plans_created_at_idx on public.city_plans (created_at desc);

-- Enable Row Level Security (RLS)
alter table public.city_plans enable row level security;

-- Policy to allow full read and write access for the city planner
create policy "Allow full access to city_plans" on public.city_plans
    for all
    using (true)
    with check (true);
