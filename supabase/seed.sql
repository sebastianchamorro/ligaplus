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

  insert into public.teams (league_id, name, short_name, logo_url, status, slug) values
    (v_league_id, 'Mitre', 'Mitre', 'liga mitre.png', 'active', 'mitre'),
    (v_league_id, 'Ferro/Pumitas', 'Ferro/Pumitas', 'liga ferro.png', 'active', 'ferro-pumitas'),
    (v_league_id, 'Rivera', 'Rivera', 'liga rivera.png', 'active', 'rivera'),
    (v_league_id, 'Madariaga', 'Madariaga', 'liga madariaga.png', 'active', 'madariaga'),
    (v_league_id, 'Comunicaciones', 'Comunicaciones', 'liga comu.png', 'active', 'comunicaciones'),
    (v_league_id, 'Guaraní', 'Guaraní', 'liga guarani.png', 'active', 'guarani'),
    (v_league_id, 'Panificación', 'Panificación', 'liga pani.png', 'active', 'panificacion'),
    (v_league_id, 'Barraca', 'Barraca', 'liga barraca.png', 'active', 'barraca'),
    (v_league_id, 'Güemes', 'Güemes', 'liga guemes.png', 'active', 'guemes'),
    (v_league_id, 'Los Catangos', 'Los Catangos', null, 'active', 'los-catangos'),
    (v_league_id, 'Marítimos', 'Marítimos', 'Maritimo FC logo.png', 'active', 'maritimos'),
    (v_league_id, 'Puente Seco', 'Puente Seco', 'liga puente seco.png', 'active', 'puente-seco'),
    (v_league_id, 'R.I. 27 Yapeyú', 'R.I. 27 Yapeyú', null, 'historic', 'ri-27-yapeyu'),
    (v_league_id, 'Club Deportivo El Fortín', 'El Fortín', null, 'historic', 'club-deportivo-el-fortin'),
    (v_league_id, 'Capitán Freyche', 'Capitán Freyche', null, 'historic', 'capitan-freyche'),
    (v_league_id, 'Banco Provincia', 'Banco Provincia', null, 'historic', 'banco-provincia')
  on conflict (league_id, name) do nothing;

  -- Historical names are matched to the existing short club where the
  -- identity is unambiguous; otherwise a distinct historic team is created.
  insert into public.teams (league_id, name, short_name, status, slug)
  select v_league_id, 'Club Atlético Victoria', 'Victoria', 'historic', 'club-atletico-victoria'
  where not exists (
    select 1 from public.teams t where t.league_id = v_league_id and t.name = 'Club Atlético Victoria'
  );
end $$;

insert into public.tournaments (league_id, name, start_date, end_date, status)
select id, 'Torneo Oficial 2026', null, null, 'in_progress'
from public.leagues l
where l.slug = 'liga-librena'
  and not exists (
    select 1 from public.tournaments t
    where t.league_id = l.id and t.name = 'Torneo Oficial 2026'
  );

insert into public.tournament_teams (tournament_id, team_id)
select t.id, tm.id
from public.tournaments t
join public.leagues l on l.id = t.league_id
join public.teams tm on tm.league_id = l.id and tm.status = 'active'
where l.slug = 'liga-librena' and t.name = 'Torneo Oficial 2026'
on conflict do nothing;

do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  -- One historical (finished) tournament per authoritative entry in dist/history.js.
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

  -- start_date se deriva del primer año de la etiqueta (ej. '1992/93' -> 1992-01-01) sólo
  -- para poder ordenar la historia cronológicamente; no implica que se conozca la fecha real.
  insert into public.tournaments (league_id, name, start_date, end_date, status, champion_team_id)
  select v_league_id, 'Temporada ' || c.year_label,
    to_date(left(c.year_label, 4), 'YYYY'), null, 'finished',
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
  where not exists (select 1 from public.tournaments t where t.league_id = v_league_id and t.name = 'Temporada ' || c.year_label);

  insert into public.matches (tournament_id, home_team_id, away_team_id, scheduled_at, matchday, status)
  select v_tournament_id, h.id, a.id, d.scheduled_at::timestamptz, 7, 'scheduled'
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
    where m.tournament_id = v_tournament_id and m.matchday = 7
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 1 real del Torneo Oficial 2026 (fin de semana 29-30/08/2026) - resultados
-- finales provistos por el usuario (recap oficial de la L.L.F.). No se conoce el
-- detalle de goles/eventos, sólo el marcador final, así que se carga en modo
-- 'manual' (igual que "Cargar sólo el resultado" desde el admin) en vez de 'events'.
-- No se sabe qué partido fue sábado y cuál domingo, así que scheduled_at queda null.
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, matchday, status, score_source, home_score, away_score, venue)
  select v_tournament_id, h.id, a.id, 1, 'finished', 'manual', fixture.home_score, fixture.away_score, fixture.venue
  from (values
    ('Madariaga', 'Guaraní', 1, 1, null),
    ('Barraca', 'Ferro/Pumitas', 1, 1, null),
    ('Rivera', 'Puente Seco', 1, 1, null),
    ('Mitre', 'Marítimos', 8, 0, null),
    ('Güemes', 'Los Catangos', 1, 1, 'Bonpland'),
    ('Comunicaciones', 'Panificación', 2, 0, null)
  ) as fixture(home_name, away_name, home_score, away_score, venue)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 1
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 2 real del Torneo Oficial 2026: sábado 5/9 (3 partidos) y domingo 6/9
-- (los otros 3), en el orden que relató el usuario. Sólo se conoce el día, no la
-- hora exacta de cada partido, así que scheduled_at queda en la fecha a medianoche
-- (no implica que el partido haya arrancado a esa hora).
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, matchday, status, score_source, home_score, away_score, scheduled_at)
  select v_tournament_id, h.id, a.id, 2, 'finished', 'manual', fixture.home_score, fixture.away_score, fixture.day::timestamptz
  from (values
    ('Güemes', 'Madariaga', 1, 1, '2026-09-05'),
    ('Mitre', 'Los Catangos', 5, 0, '2026-09-05'),
    ('Rivera', 'Marítimos', 2, 0, '2026-09-05'),
    ('Comunicaciones', 'Puente Seco', 3, 0, '2026-09-06'),
    ('Panificación', 'Barraca', 2, 1, '2026-09-06'),
    ('Ferro/Pumitas', 'Guaraní', 1, 0, '2026-09-06')
  ) as fixture(home_name, away_name, home_score, away_score, day)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 2
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 3 real del Torneo Oficial 2026: sábado (3 partidos) y domingo (los otros 3).
-- El usuario no dio la fecha calendario exacta, pero el torneo viene jugándose
-- fin de semana a fin de semana desde el 29-30/08 (fecha 1) y 5-6/09 (fecha 2), así
-- que se infiere 12-13/09 para la fecha 3 - es sólo metadata de agrupación, no un
-- resultado inventado.
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, matchday, status, score_source, home_score, away_score, scheduled_at)
  select v_tournament_id, h.id, a.id, 3, 'finished', 'manual', fixture.home_score, fixture.away_score, fixture.day::timestamptz
  from (values
    ('Guaraní', 'Panificación', 0, 0, '2026-09-12'),
    ('Rivera', 'Los Catangos', 5, 0, '2026-09-12'),
    ('Comunicaciones', 'Marítimos', 1, 1, '2026-09-12'),
    ('Barraca', 'Puente Seco', 2, 2, '2026-09-13'),
    ('Madariaga', 'Ferro/Pumitas', 1, 0, '2026-09-13'),
    ('Mitre', 'Güemes', 2, 1, '2026-09-13')
  ) as fixture(home_name, away_name, home_score, away_score, day)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 3
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 4 real del Torneo Oficial 2026. El usuario no separó los partidos por
-- sábado/domingo esta vez (sólo "este fin de semana"), así que scheduled_at queda
-- null en vez de asignar un día arbitrario.
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, matchday, status, score_source, home_score, away_score)
  select v_tournament_id, h.id, a.id, 4, 'finished', 'manual', fixture.home_score, fixture.away_score
  from (values
    ('Puente Seco', 'Guaraní', 1, 1),
    ('Panificación', 'Ferro/Pumitas', 1, 3),
    ('Güemes', 'Rivera', 0, 1),
    ('Marítimos', 'Barraca', 2, 0),
    ('Los Catangos', 'Comunicaciones', 1, 7),
    ('Mitre', 'Madariaga', 1, 1)
  ) as fixture(home_name, away_name, home_score, away_score)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 4
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 5 real del Torneo Oficial 2026. Sin split de día, scheduled_at null.
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, matchday, status, score_source, home_score, away_score)
  select v_tournament_id, h.id, a.id, 5, 'finished', 'manual', fixture.home_score, fixture.away_score
  from (values
    ('Guaraní', 'Marítimos', 5, 0),
    ('Madariaga', 'Panificación', 4, 1),
    ('Comunicaciones', 'Güemes', 1, 2),
    ('Barraca', 'Los Catangos', 1, 2),
    ('Ferro/Pumitas', 'Puente Seco', 5, 2),
    ('Rivera', 'Mitre', 1, 2)
  ) as fixture(home_name, away_name, home_score, away_score)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 5
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Fecha 6 real del Torneo Oficial 2026 (partidos pendientes, programados para el
-- sábado 17/10/2026) - datos provistos por el usuario, no inventados.
do $$
declare
  v_league_id uuid;
  v_tournament_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';
  select id into v_tournament_id from public.tournaments
    where league_id = v_league_id and name = 'Torneo Oficial 2026';

  insert into public.matches (tournament_id, home_team_id, away_team_id, scheduled_at, matchday, status)
  select v_tournament_id, h.id, a.id, d.scheduled_at::timestamptz, 6, 'scheduled'
  from (values
    ('12:30', 'Puente Seco', 'Panificación'),
    ('14:30', 'Los Catangos', 'Guaraní'),
    ('16:30', 'Rivera', 'Madariaga')
  ) as fixture(game_time, home_name, away_name)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  cross join lateral (select '2026-10-17 ' || fixture.game_time || ':00-03' as scheduled_at) d
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_tournament_id and m.matchday = 6
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

-- Segundo torneo real y simultáneo de la misma liga: Fútbol Infantil, Categoría 2015.
-- Usa las mismas entidades "club" que la Primera (es el mismo club, otra categoría),
-- con su propio conjunto de equipos participantes y su propio fixture/numeración de
-- fecha ("Jornada"), independiente del Torneo Oficial.
do $$
declare
  v_league_id uuid;
  v_infantil_id uuid;
begin
  select id into v_league_id from public.leagues where slug = 'liga-librena';

  insert into public.tournaments (league_id, name, status)
  select v_league_id, 'Fútbol Infantil · Categoría 2015', 'in_progress'
  where not exists (
    select 1 from public.tournaments t
    where t.league_id = v_league_id and t.name = 'Fútbol Infantil · Categoría 2015'
  );
  select id into v_infantil_id from public.tournaments
    where league_id = v_league_id and name = 'Fútbol Infantil · Categoría 2015';

  insert into public.tournament_teams (tournament_id, team_id)
  select v_infantil_id, t.id
  from public.teams t
  where t.league_id = v_league_id
    and t.name in ('Rivera', 'Marítimos', 'Guaraní', 'Ferro/Pumitas', 'Comunicaciones', 'Barraca', 'Panificación', 'Madariaga')
  on conflict do nothing;

  -- Jornada 9 (domingo 27/09/2026) - sólo el fixture, sin resultado conocido todavía.
  insert into public.matches (tournament_id, home_team_id, away_team_id, scheduled_at, matchday, status)
  select v_infantil_id, h.id, a.id, d.scheduled_at::timestamptz, 9, 'scheduled'
  from (values
    ('14:00', 'Rivera', 'Marítimos'),
    ('15:00', 'Guaraní', 'Ferro/Pumitas'),
    ('16:00', 'Comunicaciones', 'Barraca'),
    ('17:00', 'Panificación', 'Madariaga')
  ) as fixture(game_time, home_name, away_name)
  join public.teams h on h.league_id = v_league_id and h.name = fixture.home_name
  join public.teams a on a.league_id = v_league_id and a.name = fixture.away_name
  cross join lateral (select '2026-09-27 ' || fixture.game_time || ':00-03' as scheduled_at) d
  where not exists (
    select 1 from public.matches m
    where m.tournament_id = v_infantil_id and m.matchday = 9
      and m.home_team_id = h.id and m.away_team_id = a.id
  );
end $$;

commit;
