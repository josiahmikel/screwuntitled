-- COMMUNAL ANONYMOUS SUPABASE DATABASE SCHEMA

-- ENABLE UUID GENERATION
create extension if not exists "uuid-ossp";

-- 1. PROJECTS
create table projects (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table projects enable row level security;
-- Because this is communal, everyone has full access to the projects.
create policy "Anon select projects" on projects for select using (true);
create policy "Anon insert projects" on projects for insert with check (true);
create policy "Anon update projects" on projects for update using (true);
create policy "Anon delete projects" on projects for delete using (true);


-- 2. TRACKS (Belonging to a project directly in the 3-column grid)
create table tracks (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  title text not null,
  duration numeric default 0, -- in seconds
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table tracks enable row level security;
-- Full communal access to tracks.
create policy "Anon select tracks" on tracks for select using (true);
create policy "Anon insert tracks" on tracks for insert with check (true);
create policy "Anon update tracks" on tracks for update using (true);
create policy "Anon delete tracks" on tracks for delete using (true);


-- 3. TRACK VERSIONS (The raw audio files for when replacing a demo)
create table track_versions (
  id uuid default uuid_generate_v4() primary key,
  track_id uuid references tracks(id) on delete cascade not null,
  audio_url text not null,
  created_at timestamp with time zone default now()
);

alter table track_versions enable row level security;
create policy "Anon select versions" on track_versions for select using (true);
create policy "Anon insert versions" on track_versions for insert with check (true);
create policy "Anon delete versions" on track_versions for delete using (true);

-- Realtime Setup: Enable broadcasting so dragging a track updates everyone live.
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tracks;
