-- Voer dit volledige bestand eenmalig uit in Supabase: SQL Editor > New query > Run.
-- Persoonlijke instellingen: één regel per ingelogde gebruiker.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  filters jsonb not null default '{"usdtOnly": true, "minVolume": 1000000, "watchlistOnly": false}'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

grant select, insert, update on public.user_settings to authenticated;

drop policy if exists "Users manage only their own settings" on public.user_settings;
create policy "Users manage only their own settings"
  on public.user_settings
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
