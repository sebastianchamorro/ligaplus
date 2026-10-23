export type League = {
  id: string
  slug: string
  name: string
  logo_url: string | null
  is_public: boolean
}

export type Team = {
  id: string
  name: string
  short_name: string | null
  logo_url: string | null
  status: 'active' | 'historic'
  slug?: string
  history?: string | null
}

export type TeamTrophy = {
  tournament_id: string
  name: string
  start_date: string | null
}

export type TeamTournamentStanding = StandingsRow & {
  tournament_id: string
  tournament_name: string
  position: number
}

export type Tournament = {
  id: string
  league_id: string
  name: string
  start_date: string | null
  end_date: string | null
  status: 'upcoming' | 'in_progress' | 'finished'
  champion_team_id: string | null
}

export type StandingsRow = {
  team_id: string
  team_name: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
}

export type MatchWithTeams = {
  id: string
  scheduled_at: string | null
  matchday: number | null
  status: 'scheduled' | 'live' | 'finished' | 'postponed'
  home_score: number
  away_score: number
  score_source: 'events' | 'manual'
  referee_id: string | null
  home_team: { id: string; name: string; logo_url?: string | null; short_name?: string | null }
  away_team: { id: string; name: string; logo_url?: string | null; short_name?: string | null }
}

export type MatchDetail = MatchWithTeams & {
  tournament_id: string
  venue: string | null
  tournament: { id: string; name: string; league_id: string }
  referee: { id: string; full_name: string } | null
}

export type MatchEvent = {
  id: string
  minute: number
  extra_minute: number | null
  type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution'
  team_id: string
  team: { id: string; name: string }
  player: { full_name: string } | null
  player_in: { full_name: string } | null
  player_out: { full_name: string } | null
}

export type ChampionEntry = {
  tournament_id: string
  name: string
  champion_team_name: string | null
}

export type Referee = {
  id: string
  league_id: string
  full_name: string
}

export type Player = {
  id: string
  team_id: string
  full_name: string
  shirt_number: number | null
  position: string | null
  photo_url: string | null
}

export type StaffMember = {
  id: string
  team_id: string
  full_name: string
  role: string
}

export function useLeagueBySlug(slug: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<League | null>(`league:${slug}`, async () => {
    const { data, error } = await supabase
      .from('leagues')
      .select('id, slug, name, logo_url, is_public')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

export function usePublicLeagues() {
  const supabase = useSupabaseClient()
  return useAsyncData<League[]>('leagues:public', async () => {
    const { data, error } = await supabase
      .from('leagues')
      .select('id, slug, name, logo_url, is_public')
      .eq('is_public', true)
      .order('name')
    if (error) throw error
    return data ?? []
  })
}

export function useLeagueTeams(leagueId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Team[]>(`teams:${leagueId}`, async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, short_name, logo_url, status, slug, history')
      .eq('league_id', leagueId)
      .order('status')
      .order('name')
    if (error) throw error
    return data ?? []
  })
}

export function useTeamBySlug(leagueId: string, slug: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Team | null>(`team:${leagueId}:${slug}`, async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, short_name, logo_url, status, slug, history')
      .eq('league_id', leagueId)
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

// Palmarés: todos los torneos finalizados que ganó ESTE equipo (no toda la liga).
export function useTeamTrophies(teamId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<TeamTrophy[]>(`trophies:${teamId}`, async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, start_date')
      .eq('champion_team_id', teamId)
      .order('start_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((t) => ({ tournament_id: t.id, name: t.name, start_date: t.start_date }))
  })
}

// Desempeño en los torneos EN JUEGO de los que participa este equipo (puede ser más de uno).
export function useTeamCurrentStandings(leagueId: string, teamId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<TeamTournamentStanding[]>(`team-standings:${teamId}`, async () => {
    const { data: tIds, error: tError } = await supabase
      .from('tournament_teams')
      .select('tournament_id, tournaments!inner(id, name, league_id, status)')
      .eq('team_id', teamId)
      .eq('tournaments.league_id', leagueId)
      .eq('tournaments.status', 'in_progress')
    if (tError) throw tError

    const results: TeamTournamentStanding[] = []
    for (const row of tIds ?? []) {
      const tournament = (row as any).tournaments
      const { data: standings, error } = await supabase.rpc('standings', {
        p_tournament_id: tournament.id
      })
      if (error) throw error
      const rows = (standings as StandingsRow[]) ?? []
      const position = rows.findIndex((s) => s.team_id === teamId)
      if (position !== -1) {
        results.push({
          ...rows[position],
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          position: position + 1
        })
      }
    }
    return results
  })
}

// Una liga puede tener varios torneos corriendo a la vez (simultáneos o no);
// esto trae los que están activos/próximos, no asume que exista uno solo "el actual".
export function useActiveTournaments(leagueId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Tournament[]>(`tournaments:active:${leagueId}`, async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, league_id, name, start_date, end_date, status, champion_team_id')
      .eq('league_id', leagueId)
      .in('status', ['in_progress', 'upcoming'])
      .order('start_date', { ascending: false })
    if (error) throw error
    return data ?? []
  })
}

// Para el admin: todas las ligas de un torneo sin importar el estado (incluye finalizados),
// a diferencia de useActiveTournaments que es para la vista pública.
export function useAllTournaments(leagueId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Tournament[]>(`tournaments:all:${leagueId}`, async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, league_id, name, start_date, end_date, status, champion_team_id')
      .eq('league_id', leagueId)
      .order('start_date', { ascending: false })
    if (error) throw error
    return data ?? []
  })
}

export function useLeagueReferees(leagueId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Referee[]>(`referees:${leagueId}`, async () => {
    const { data, error } = await supabase
      .from('referees')
      .select('id, league_id, full_name')
      .eq('league_id', leagueId)
      .order('full_name')
    if (error) throw error
    return data ?? []
  })
}

export function useTeamPlayers(teamId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<Player[]>(`players:${teamId}`, async () => {
    const { data, error } = await supabase
      .from('players')
      .select('id, team_id, full_name, shirt_number, position, photo_url')
      .eq('team_id', teamId)
      .order('shirt_number')
    if (error) throw error
    return data ?? []
  })
}

export function useTeamStaff(teamId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<StaffMember[]>(`staff:${teamId}`, async () => {
    const { data, error } = await supabase
      .from('team_staff')
      .select('id, team_id, full_name, role')
      .eq('team_id', teamId)
      .order('full_name')
    if (error) throw error
    return data ?? []
  })
}

export function useTournamentStandings(tournamentId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<StandingsRow[]>(`standings:${tournamentId}`, async () => {
    const { data, error } = await supabase.rpc('standings', { p_tournament_id: tournamentId })
    if (error) throw error
    return (data as StandingsRow[]) ?? []
  })
}

export function useTournamentMatches(tournamentId: string, status?: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<MatchWithTeams[]>(`matches:${tournamentId}:${status ?? 'all'}`, async () => {
    let query = supabase
      .from('matches')
      .select(
        'id, scheduled_at, matchday, status, home_score, away_score, score_source, referee_id,' +
          'home_team:teams!matches_home_team_id_fkey(id, name),' +
          'away_team:teams!matches_away_team_id_fkey(id, name)'
      )
      .eq('tournament_id', tournamentId)
      .order('scheduled_at')
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return (data as unknown as MatchWithTeams[]) ?? []
  })
}

export function useMatchById(matchId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<MatchDetail | null>(`match:${matchId}`, async () => {
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, tournament_id, scheduled_at, matchday, venue, status, home_score, away_score, score_source, referee_id,' +
          'home_team:teams!matches_home_team_id_fkey(id, name, logo_url, short_name),' +
          'away_team:teams!matches_away_team_id_fkey(id, name, logo_url, short_name),' +
          'tournament:tournaments!matches_tournament_id_fkey(id, name, league_id),' +
          'referee:referees!matches_referee_id_fkey(id, full_name)'
      )
      .eq('id', matchId)
      .maybeSingle()
    if (error) throw error
    return data as unknown as MatchDetail | null
  })
}

export function useMatchEvents(matchId: string, enabled = true) {
  const supabase = useSupabaseClient()
  return useAsyncData<MatchEvent[]>(`match-events:${matchId}`, async () => {
    if (!enabled) return []
    const { data, error } = await supabase
      .from('match_events')
      .select(
        'id, minute, extra_minute, type, team_id,' +
          'team:teams!match_events_team_id_fkey(id, name),' +
          'player:players!match_events_player_id_fkey(full_name),' +
          'player_in:players!match_events_player_in_id_fkey(full_name),' +
          'player_out:players!match_events_player_out_id_fkey(full_name)'
      )
      .eq('match_id', matchId)
      .order('minute', { ascending: true })
      .order('extra_minute', { ascending: true, nullsFirst: true })
    if (error) throw error
    return (data as unknown as MatchEvent[]) ?? []
  })
}

export function useLeagueChampions(leagueId: string) {
  const supabase = useSupabaseClient()
  return useAsyncData<ChampionEntry[]>(`champions:${leagueId}`, async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, champion:teams!tournaments_champion_team_id_fkey(name)')
      .eq('league_id', leagueId)
      .eq('status', 'finished')
      .not('champion_team_id', 'is', null)
      .order('start_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      tournament_id: row.id,
      name: row.name,
      champion_team_name: row.champion?.name ?? null
    }))
  })
}
