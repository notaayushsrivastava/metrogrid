-- MetroGrid database schema (PRD §17).
-- Run this against the Supabase `public` schema before enabling persistence.

create table if not exists city_plans (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    grid_state  jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

-- Optional indexes for future authenticated lookups.
-- create index if not exists city_plans_created_at_idx on city_plans (created_at);