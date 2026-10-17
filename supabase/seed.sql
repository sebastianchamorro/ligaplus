-- The old prototype only tracked the pre-Fecha-7 standings as an aggregate
-- snapshot; it never tracked Fecha 1-6 match results, dates, or events. The
-- match/match_events log therefore starts clean from Fecha 7 onward. An admin
-- must backfill the missing history separately or accept standings starting
-- fresh from the new match log.

begin;

insert into public.leagues (slug, name, logo_url, is_public)
values ('liga-librena', 'Liga Libreña', null, true)
on conflict (slug) do nothing;

do $$
declare
  v_league_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';

  insert into public.teams (league_id, name, short_name, logo_url, status) values
    (v_league_id, 'Mitre', 'Mitre', 'liga mitre.png', 'active'),
    (v_league_id, 'Ferro/Pumitas', 'Ferro/Pumitas', 'liga ferro.png', 'active'),
    (v_league_id, 'Rivera', 'Rivera', 'liga rivera.png', 'active'),
    (v_league_id, 'Madariaga', 'Madariaga', 'liga madariaga.png', 'active'),
    (v_league_id, 'Comunicaciones', 'Comunicaciones', 'liga comu.png', 'active'),
    (v_league_id, 'Guaraní', 'Guaraní', 'liga guarani.png', 'active'),
    (v_league_id, 'Panificación', 'Panificación', 'liga pani.png', 'active'),
    (v_league_id, 'Barraca', 'Barraca', 'liga barraca.png', 'active'),
    (v_league_id, 'Güemes', 'Güemes', 'liga guemes.png', 'active'),
    (v_league_id, 'Los Catangos', 'Los Catangos', null, 'active'),
    (v_league_id, 'Marítimos', 'Marítimos', 'Maritimo FC logo.png', 'active'),
    (v_league_id, 'Puente Seco', 'Puente Seco', 'liga puente seco.png', 'active'),
    (v_league_id, 'R.I. 27 Yapeyú', 'R.I. 27 Yapeyú', null, 'historic'),
    (v_league_id, 'Club Deportivo El Fortín', 'El Fortín', null, 'historic'),
    (v_league_id, 'Capitán Freyche', 'Capitán Freyche', null, 'historic'),
    (v_league_id, 'Banco Provincia', 'Banco Provincia', null, 'historic')
  on conflict (league_id, name) do nothing;

  -- Historical names are matched to the existing short club where the
  -- identity is unambiguous; otherwise a distinct historic team is created.
  insert into public.teams (league_id, name, short_name, status)
  select v_league_id, 'Club Atlético Victoria', 'Victoria', 'historic'
  where not exists (
    select 1 from public.teams t where t.league_id = v_league_id and t.name = 'Club Atlético Victoria'
  );
end $$;

insert into public.seasons (league_id, name, start_date, end_date, is_current)
select id, 'Torneo Oficial 2026', null, null, true
from public.leagues l
where l.slug = 'liga-librena'
  and not exists (
    select 1 from public.seasons s
    where s.league_id = l.id and s.name = 'Torneo Oficial 2026'
  );

insert into public.season_teams (season_id, team_id)
select s.id, t.id
from public.seasons s
join public.leagues l on l.id = s.league_id
join public.teams t on t.league_id = l.id and t.status = 'active'
where l.slug = 'liga-librena' and s.name = 'Torneo Oficial 2026'
on conflict do nothing;

do $$
declare
  v_league_id uuid;
  v_season_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_season_id from public.seasons
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  -- One historical season per authoritative entry in dist/history.js.
  create temporary table seed_champions (year_label text, club_name text) on commit drop;
  insert into seed_champions values
    ('2025', 'Mitre'),
    ('2002', 'Club Social Cultural y Deportivo Puente Seco'),
    ('1999', 'Club Social Cultural y Deportivo Puente Seco'),
    ('1997', 'Club Atlético Sporting Panificación'),
    ('1995', 'Club Atlético Sporting Panificación'),
    ('1994', 'Club Atlético Guaraní'),
    ('1992/93', 'Club Social y Deportivo Barraca'),
    ('1991', 'Club Social y Deportivo Rivera'),
    ('1989/90', 'Club Social y Deportivo Barraca'),
    ('1987/88', 'Club Atlético Guaraní'),
    ('1986', 'Club Atlético Ferrocarril'),
    ('1985', 'Club Banco Provincia'),
    ('1984', 'Club Atlético Guaraní'),
    ('1983', 'Club Banco Provincia'),
    ('1979/82', 'Club Atlético Guaraní'),
    ('1978', 'Club Atlético Victoria'),
    ('1977', 'Club Capitán Freyche'),
    ('1976', 'Club Atlético Guaraní'),
    ('1975', 'Club Atlético Ferrocarril'),
    ('1974', 'Club Social y Deportivo Barraca'),
    ('1973', 'Club Atlético Guaraní'),
    ('1972', 'Club Capitán Freyche'),
    ('1971', 'Club Atlético Comunicaciones'),
    ('1969/70', 'Club Capitán Freyche'),
    ('1968', 'Club Atlético Victoria'),
    ('1964/67', 'Club Capitán Freyche'),
    ('1963', 'Club R.I. 27 Yapeyú'),
    ('1961/62', 'Club Social y Deportivo Barraca'),
    ('1960', 'Club Atlético Guaraní'),
    ('1959', 'Club Social y Deportivo Barraca'),
    ('1958', 'Club Atlético Victoria'),
    ('1957', 'Club Social y Deportivo Barraca'),
    ('1956', 'Club Deportivo El Fortín'),
    ('1955', 'Club Social y Deportivo Barraca'),
    ('1953/54', 'Club R.I. 27 Yapeyú'),
    ('1950/52', 'Club Social y Deportivo Barraca');

  insert into public.seasons (league_id, name, start_date, end_date, is_current, champion_team_id)
  select v_league_id, 'Temporada ' || c.year_label, null, null, false,
    case c.club_name
      when 'Club Social Cultural y Deportivo Puente Seco' then (select id from public.teams where league_id = v_league_id and name = 'Puente Seco')
      when 'Club Atlético Sporting Panificación' then (select id from public.teams where league_id = v_league_id and name = 'Panificación')
      when 'Club Atlético Guaraní' then (select id from public.teams where league_id = v_league_id and name = 'Guaraní')
      when 'Club Social y Deportivo Barraca' then (select id from public.teams where league_id = v_league_id and name = 'Barraca')
      when 'Club Social y Deportivo Rivera' then (select id from public.teams where league_id = v_league_id and name = 'Rivera')
      when 'Club Atlético Ferrocarril' then (select id from public.teams where league_id = v_league_id and name = 'Ferro/Pumitas')
      when 'Club Banco Provincia' then (select id from public.teams where league_id = v_league_id and name = 'Banco Provincia')
      when 'Club Atlético Comunicaciones' then (select id from public.teams where league_id = v_league_id and name = 'Comunicaciones')
      when 'Club Capitán Freyche' then (select id from public.teams where league_id = v_league_id and name = 'Capitán Freyche')
      when 'Club R.I. 27 Yapeyú' then (select id from public.teams where league_id = v_league_id and name = 'R.I. 27 Yapeyú')
      else (select id from public.teams where league_id = v_league_id and name = c.club_name)
    end
  from seed_champions c
  where not exists (select 1 from public.seasons s where s.league_id = v_league_id and s.name = 'Temporada ' || c.year_label);

  insert into public.matches (season_id, home_team_id, away_team_id, scheduled_at, matchday, status)
  select v_season_id, h.id, a.id, d.scheduled_at::timestamptz, 7, 'scheduled'
  from (values
    ('12:30', 'Panificación', 'Marítimos'),
    ('14:30', 'Barraca', 'Mitre'),
    ('16:30', 'Madariaga', 'Puente Seco'),
    ('12:30', 'Guaraní', 'Güemes'),
    ('14:30', 'Ferro/Pumitas', 'Los Catangos'),
    ('16:30', 'Comunicaciones', 'Rivera')
  ) as fixture(game_time, home_name, away_name)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  cross join lateral (select '2026-10-18 ' || fixture.game_time || ':00-03' as scheduled_at) d
  where not exists (
    select 1 from public.matches m
    where m.season_id = v_season_id and m.matchday = 7
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

commit;
