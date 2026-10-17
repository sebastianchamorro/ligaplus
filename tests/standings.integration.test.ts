import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const canRun = Boolean(supabaseUrl && serviceRoleKey)

describe.skipIf(!canRun)('standings() (requires a running local Supabase stack)', () => {
  const db = createClient(supabaseUrl!, serviceRoleKey!)
  let leagueId: string | undefined
  let tournamentId: string | undefined
  let reachable = true

  beforeAll(async () => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/`, { headers: { apikey: serviceRoleKey! } })
    } catch {
      reachable = false
    }
  })

  afterAll(async () => {
    if (!leagueId) return
    // matches.home_team_id/away_team_id intentionally don't cascade from teams (so
    // deleting/merging a team can't silently wipe its match history elsewhere) - that
    // means deleting the league alone fails partway through with a FK violation once
    // it tries to cascade-delete teams while matches still reference them. Delete
    // matches first, then the league cascade (teams/tournaments/tournament_teams)
    // goes through cleanly.
    if (tournamentId) await db.from('matches').delete().eq('tournament_id', tournamentId)
    await db.from('leagues').delete().eq('id', leagueId)
  })

  it('computes totals and orders a three-way tie by goal difference then goals for', async ({ skip }) => {
    // Keep CI and non-Supabase local runs green; run this test with `supabase start`.
    if (!reachable) skip()

    const slug = `vitest-${Date.now()}`
    const { data: league, error: leagueError } = await db
      .from('leagues').insert({ slug, name: 'Vitest disposable league' }).select('id').single()
    expect(leagueError).toBeNull()
    leagueId = league!.id

    const { data: tournament, error: tournamentError } = await db
      .from('tournaments').insert({ league_id: leagueId, name: 'Vitest season' })
      .select('id').single()
    expect(tournamentError).toBeNull()
    tournamentId = tournament!.id

    const names = ['Aquila', 'Boreal', 'Cumbre', 'Delta', 'Estrella']
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .insert(names.map(name => ({ league_id: leagueId, name, slug: name.toLowerCase() })))
      .select('id, name').order('name')
    expect(teamsError).toBeNull()
    const byName = Object.fromEntries(teams!.map(team => [team.name, team.id]))

    const { error: membershipError } = await db.from('tournament_teams').insert(
      teams!.map(team => ({ tournament_id: tournament!.id, team_id: team.id }))
    )
    expect(membershipError).toBeNull()

    // A-B, B-C, C-A form a 3-point cycle. B and C tie on goal difference,
    // so goals-for is the decisive second tiebreak between them.
    // D-E is the independent draw that verifies drawn/points accounting.
    const matches = [
      ['Aquila', 'Boreal', 1, 0],
      ['Boreal', 'Cumbre', 2, 0],
      ['Cumbre', 'Aquila', 3, 0],
      ['Delta', 'Estrella', 0, 0]
    ].map(([home, away, home_score, away_score]) => ({
      tournament_id: tournament!.id,
      home_team_id: byName[home as string],
      away_team_id: byName[away as string],
      home_score,
      away_score,
      status: 'finished'
    }))
    const { error: matchesError } = await db.from('matches').insert(matches)
    expect(matchesError).toBeNull()

    const { data: rows, error: standingsError } = await db.rpc('standings', {
      p_tournament_id: tournament!.id
    })
    expect(standingsError).toBeNull()
    // Boreal and Cumbre are both on 3pts, GD+1 - the tiebreak is goals_for, and
    // Cumbre's 3 beats Boreal's 2, so Cumbre ranks first despite conceding the
    // same differential.
    expect(rows!.slice(0, 3)).toEqual([
      { team_id: byName.Cumbre, team_name: 'Cumbre', played: 2, won: 1, drawn: 0, lost: 1, goals_for: 3, goals_against: 2, goal_difference: 1, points: 3 },
      { team_id: byName.Boreal, team_name: 'Boreal', played: 2, won: 1, drawn: 0, lost: 1, goals_for: 2, goals_against: 1, goal_difference: 1, points: 3 },
      { team_id: byName.Aquila, team_name: 'Aquila', played: 2, won: 1, drawn: 0, lost: 1, goals_for: 1, goals_against: 3, goal_difference: -2, points: 3 }
    ])
    expect(rows!.slice(3)).toEqual(expect.arrayContaining([
      { team_id: byName.Delta, team_name: 'Delta', played: 1, won: 0, drawn: 1, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 1 },
      { team_id: byName.Estrella, team_name: 'Estrella', played: 1, won: 0, drawn: 1, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 1 }
    ]))
  })
})
