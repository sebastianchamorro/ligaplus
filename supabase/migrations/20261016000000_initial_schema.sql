-- Fase 1: esquema inicial multi-liga (ver ROADMAP.md)
-- Tablas multi-tenant scoped por league_id (directo o via join), para RLS futuro (Fase 2).

create extension if not exists "pgcrypto";

-- ===== Identidad =====

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.app_super_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ===== Ligas y membresías =====

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  is_public boolean not null default true,
  owner_profile_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  short_name text,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'historic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name)
);

create type public.league_role as enum ('league_admin', 'team_admin', 'data_loader', 'viewer');

create table public.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.league_role not null,
  team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, profile_id, team_id)
);

-- ===== Temporadas =====

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  champion_team_id uuid references public.teams (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.season_teams (
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  primary key (season_id, team_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  full_name text not null,
  shirt_number int,
  position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== Partidos y eventos =====

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  scheduled_at timestamptz,
  matchday int,
  venue text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'postponed')),
  home_score int not null default 0,
  away_score int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create type public.match_event_type as enum ('goal', 'own_goal', 'yellow_card', 'red_card', 'substitution');

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  minute int not null,
  extra_minute int,
  type public.match_event_type not null,
  team_id uuid not null references public.teams (id),
  player_id uuid references public.players (id),
  player_in_id uuid references public.players (id),
  player_out_id uuid references public.players (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Los goles se cargan como match_events; home_score/away_score en matches son un cache
-- derivado, nunca se escriben a mano desde la app.
create function public.recalculate_match_score()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_match_id uuid := coalesce(new.match_id, old.match_id);
begin
  update public.matches m
  set
    home_score = (
      select count(*) from public.match_events e
      where e.match_id = target_match_id
        and e.type = 'goal'
        and e.team_id = m.home_team_id
    ) + (
      select count(*) from public.match_events e
      where e.match_id = target_match_id
        and e.type = 'own_goal'
        and e.team_id = m.away_team_id
    ),
    away_score = (
      select count(*) from public.match_events e
      where e.match_id = target_match_id
        and e.type = 'goal'
        and e.team_id = m.away_team_id
    ) + (
      select count(*) from public.match_events e
      where e.match_id = target_match_id
        and e.type = 'own_goal'
        and e.team_id = m.home_team_id
    ),
    updated_at = now()
  where m.id = target_match_id;
  return null;
end;
$$;

create trigger on_match_event_change
  after insert or update or delete on public.match_events
  for each row execute procedure public.recalculate_match_score();

-- ===== Standings =====

create function public.standings(p_season_id uuid)
returns table (
  team_id uuid,
  team_name text,
  played int,
  won int,
  drawn int,
  lost int,
  goals_for int,
  goals_against int,
  goal_difference int,
  points int
)
language sql
stable
as $$
  with season_matches as (
    select * from public.matches
    where season_id = p_season_id and status = 'finished'
  ),
  team_rows as (
    select home_team_id as team_id, home_score as gf, away_score as ga
    from season_matches
    union all
    select away_team_id as team_id, away_score as gf, home_score as ga
    from season_matches
  )
  select
    t.id as team_id,
    t.name as team_name,
    count(tr.team_id)::int as played,
    count(*) filter (where tr.gf > tr.ga)::int as won,
    count(*) filter (where tr.gf = tr.ga)::int as drawn,
    count(*) filter (where tr.gf < tr.ga)::int as lost,
    coalesce(sum(tr.gf), 0)::int as goals_for,
    coalesce(sum(tr.ga), 0)::int as goals_against,
    coalesce(sum(tr.gf) - sum(tr.ga), 0)::int as goal_difference,
    (count(*) filter (where tr.gf > tr.ga) * 3 + count(*) filter (where tr.gf = tr.ga))::int as points
  from public.season_teams st
  join public.teams t on t.id = st.team_id
  left join team_rows tr on tr.team_id = t.id
  where st.season_id = p_season_id
  group by t.id, t.name
  order by points desc, goal_difference desc, goals_for desc;
$$;
