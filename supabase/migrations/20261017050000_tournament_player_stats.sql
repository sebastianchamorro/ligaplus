create or replace function public.tournament_player_stats(p_tournament_id uuid)
returns table (player_id uuid, player_name text, team_id uuid, team_name text, photo_url text, goals int, yellow_cards int, red_cards int)
language sql stable
as $$
  select p.id, p.full_name, t.id, t.name, p.photo_url,
    count(*) filter (where e.type = 'goal')::int,
    count(*) filter (where e.type = 'yellow_card')::int,
    count(*) filter (where e.type = 'red_card')::int
  from public.match_events e
  join public.matches m on m.id = e.match_id
  join public.players p on p.id = e.player_id
  left join public.teams t on t.id = p.team_id
  where m.tournament_id = p_tournament_id
    and e.type in ('goal', 'yellow_card', 'red_card')
  group by p.id, p.full_name, t.id, t.name, p.photo_url
  order by count(*) filter (where e.type = 'goal') desc, p.full_name;
$$;
