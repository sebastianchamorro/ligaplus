-- Fase 1 (cont.): soporte para administrar torneos de verdad desde el admin.
-- - Árbitros (opcional) por partido.
-- - Cuerpo técnico (opcional) por equipo, además de los jugadores que ya existían.
-- - Modo de carga de resultado: 'events' (se deriva de match_events, como hasta ahora)
--   o 'manual' (el admin carga el resultado final directo, sin cargar cada evento).
--   El trigger de recálculo de score ignora los partidos en modo 'manual'.

create table public.referees (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  unique (league_id, full_name)
);

alter table public.matches
  add column referee_id uuid references public.referees (id) on delete set null;

create table public.team_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  full_name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

alter table public.matches
  add column score_source text not null default 'events'
    check (score_source in ('events', 'manual'));

-- El trigger ya existente (recalculate_match_score) sólo debe tocar partidos en modo
-- 'events'; un partido en modo 'manual' conserva el resultado que cargó el admin aunque
-- más tarde se le agregue algún evento suelto (ej. una tarjeta, sin querer pasar a llevar
-- el resultado cargado a mano).
create or replace function public.recalculate_match_score()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_match_id uuid := coalesce(new.match_id, old.match_id);
  target_score_source text;
begin
  select score_source into target_score_source from public.matches where id = target_match_id;
  if target_score_source = 'manual' then
    return null;
  end if;

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
