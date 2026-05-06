create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'agency')),
  subscription_status text not null default 'inactive',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  monitoring_enabled boolean not null default true,
  check_interval_minutes integer not null default 60,
  last_status text default 'pending',
  last_score integer,
  last_response_time_ms integer,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites add column if not exists keyword text;
alter table public.sites add column if not exists keyword_should_exist boolean not null default true;
alter table public.sites add column if not exists maintenance_starts_at timestamptz;
alter table public.sites add column if not exists maintenance_ends_at timestamptz;
alter table public.sites add column if not exists status_page_enabled boolean not null default false;
alter table public.sites add column if not exists public_slug text unique default encode(gen_random_bytes(6), 'hex');
alter table public.sites add column if not exists email_alerts_enabled boolean not null default true;
alter table public.sites add column if not exists alert_on_down boolean not null default true;
alter table public.sites add column if not exists alert_on_warning boolean not null default true;
alter table public.sites add column if not exists alert_on_recovery boolean not null default true;

create table if not exists public.checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  score integer,
  status_code integer,
  response_time_ms integer,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('down', 'warning', 'resolved')),
  title text not null,
  details jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.incidents add column if not exists duration_seconds integer;
alter table public.incidents add column if not exists resolved_details jsonb;
alter table public.incidents add column if not exists confirmed_after_checks integer not null default 1;

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.checks enable row level security;
alter table public.incidents enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "sites_select_own" on public.sites;
create policy "sites_select_own"
on public.sites for select
using (auth.uid() = user_id);

drop policy if exists "sites_insert_own" on public.sites;
create policy "sites_insert_own"
on public.sites for insert
with check (auth.uid() = user_id);

drop policy if exists "sites_update_own" on public.sites;
create policy "sites_update_own"
on public.sites for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "sites_delete_own" on public.sites;
create policy "sites_delete_own"
on public.sites for delete
using (auth.uid() = user_id);

drop policy if exists "checks_select_own" on public.checks;
create policy "checks_select_own"
on public.checks for select
using (auth.uid() = user_id);

drop policy if exists "incidents_select_own" on public.incidents;
create policy "incidents_select_own"
on public.incidents for select
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create index if not exists sites_user_id_idx on public.sites(user_id);
create index if not exists sites_public_slug_idx on public.sites(public_slug);
create index if not exists checks_site_id_created_at_idx on public.checks(site_id, created_at desc);
create index if not exists checks_user_id_created_at_idx on public.checks(user_id, created_at desc);
create index if not exists incidents_site_id_created_at_idx on public.incidents(site_id, created_at desc);
create index if not exists incidents_user_id_created_at_idx on public.incidents(user_id, created_at desc);
