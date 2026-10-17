-- Soporte para una página pública por club: URL amigable (slug) e historia editable
-- desde el admin. El desempeño en el torneo actual y el palmarés no necesitan columnas
-- nuevas - salen de tournament_teams/standings() y de tournaments.champion_team_id.

alter table public.teams
  add column slug text,
  add column history text;

-- Backfill de los equipos que ya existían (slug simple a partir del nombre).
update public.teams
set slug = lower(
  regexp_replace(
    regexp_replace(trim(name), '[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+', '-', 'g'),
    '(^-|-$)', '', 'g'
  )
)
where slug is null;

-- Sin tildes, para que las URLs queden limpias.
update public.teams set slug = translate(slug,
  'áéíóúñÁÉÍÓÚÑ',
  'aeiounAEIOUN'
);

alter table public.teams
  alter column slug set not null,
  add constraint teams_league_id_slug_key unique (league_id, slug);
