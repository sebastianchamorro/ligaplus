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
  home_team: { id: string; name: string }
  away_team: { id: string; name: string }
}

export type ChampionEntry = {
  tournament_id: string
  name: string
  champion_team_name: string | null
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
      .select('id, name, short_name, logo_url, status')
      .eq('league_id', leagueId)
      .order('status')
      .order('name')
    if (error) throw error
    return data ?? []
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
        'id, scheduled_at, matchday, status, home_score, away_score,' +
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
