<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) {
  throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })
}

const { data: tournaments } = await useActiveTournaments(league.value.id)
const { data: teams } = await useLeagueTeams(league.value.id)
const { data: champions } = await useLeagueChampions(league.value.id)

const selectedTournamentId = ref(tournaments.value?.[0]?.id ?? '')
const selectedTournament = computed(() =>
  tournaments.value?.find((t) => t.id === selectedTournamentId.value) ?? null
)

const { data: standings, refresh: refreshStandings } = await useAsyncData(
  'standings-selected',
  async () => {
    if (!selectedTournamentId.value) return []
    const { data, error } = await useSupabaseClient().rpc('standings', {
      p_tournament_id: selectedTournamentId.value
    })
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedTournamentId] }
)

const { data: fixture, refresh: refreshFixture } = await useAsyncData(
  'fixture-selected',
  async () => {
    if (!selectedTournamentId.value) return []
    const supabase = useSupabaseClient()
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, scheduled_at, matchday, status, home_score, away_score,' +
          'home_team:teams!matches_home_team_id_fkey(id, name),' +
          'away_team:teams!matches_away_team_id_fkey(id, name)'
      )
      .eq('tournament_id', selectedTournamentId.value)
      .eq('status', 'scheduled')
      .order('scheduled_at')
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedTournamentId] }
)

const activeTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'active'))
const historicTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'historic'))

function formatKickoff(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app · {{ league?.name }}</span>
      <b>Centro público</b>
    </div>
    <nav class="nav">
      <div class="brand">{{ league?.name?.toUpperCase() }}</div>
      <div class="navlinks">
        <a href="#tabla">Tabla</a>
        <a href="#fixture">Fixture</a>
        <a href="#clubes">Clubes</a>
        <a href="#historia">Historia</a>
        <NuxtLink :to="`/${leagueSlug}/admin`">Administrar</NuxtLink>
      </div>
    </nav>

    <main class="shell">
      <section class="page-title">
        <div>
          <h1>Fútbol con historia.</h1>
          <p class="muted">La información oficial de la liga, sus clubes y sus torneos.</p>
        </div>
        <NuxtLink class="btn" :to="`/${leagueSlug}/admin`">Ir al panel admin</NuxtLink>
      </section>

      <section v-if="(tournaments?.length ?? 0) > 1" class="panel">
        <div class="panel-body" style="display: flex; gap: 10px; flex-wrap: wrap">
          <button
            v-for="t in tournaments"
            :key="t.id"
            class="btn"
            :class="{ secondary: t.id !== selectedTournamentId }"
            @click="selectedTournamentId = t.id"
          >
            {{ t.name }}
          </button>
        </div>
      </section>

      <section id="tabla" class="section">
        <div class="page-title">
          <div>
            <h2>Tabla de posiciones</h2>
            <p class="muted">{{ selectedTournament?.name }}</p>
          </div>
        </div>
        <div class="grid">
          <section class="panel">
            <div class="panel-body" style="padding: 0">
              <table class="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Club</th>
                    <th>PJ</th>
                    <th>G</th>
                    <th>DG</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in standings" :key="row.team_id" :class="{ champ: i === 0 }">
                    <td>{{ String(i + 1).padStart(2, '0') }}</td>
                    <td><b>{{ row.team_name }}</b></td>
                    <td>{{ row.played }}</td>
                    <td>{{ row.won }}</td>
                    <td>{{ row.goal_difference }}</td>
                    <td>{{ row.points }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="fixture" class="panel">
            <div class="panel-head">
              <h2>Próximos partidos</h2>
              <span class="muted">{{ selectedTournament?.name }}</span>
            </div>
            <div class="panel-body">
              <div v-for="game in fixture" :key="game.id" class="item">
                <span>
                  <b>{{ game.home_team.name }} vs {{ game.away_team.name }}</b>
                  <small class="muted">{{ formatKickoff(game.scheduled_at) }} · Fecha {{ game.matchday }}</small>
                </span>
                <span class="badge">Programado</span>
              </div>
              <p v-if="!fixture?.length" class="muted">No hay partidos programados.</p>
            </div>
          </section>
        </div>
      </section>

      <section id="clubes" class="section">
        <div class="page-title">
          <div>
            <h2>Clubes de la liga</h2>
            <p class="muted">Actuales e históricos, cada uno con su identidad.</p>
          </div>
        </div>
        <div class="cards">
          <div v-for="club in [...activeTeams, ...historicTeams]" :key="club.id" class="card" :class="{ 'historic-card': club.status === 'historic' }">
            <div style="height: 82px; display: flex; align-items: center; justify-content: center">
              <img v-if="club.logo_url" :src="club.logo_url" :alt="club.name" style="height: 82px; max-width: 100%; object-fit: contain" />
              <span v-else style="font: 700 32px 'Barlow Condensed'; color: var(--muted)">?</span>
            </div>
            <h3 style="font-size: 22px; margin: 10px 0 5px">{{ club.name }}</h3>
            <p>{{ club.status === 'active' ? 'Actual' : 'No existe actualmente' }}</p>
          </div>
        </div>
      </section>

      <section id="historia" class="section">
        <div class="page-title">
          <div>
            <h2>Historia de {{ league?.name }}</h2>
            <p class="muted">Campeones oficiales · del más reciente al más antiguo</p>
          </div>
        </div>
        <section class="panel" style="background: var(--green); color: white">
          <div class="panel-head">
            <h2>Campeones oficiales</h2>
          </div>
          <div class="panel-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
            <div
              v-for="(champ, i) in champions"
              :key="champ.tournament_id"
              class="item"
              :class="{ champion: i === 0 }"
              style="background: white; color: var(--ink)"
            >
              <b style="color: var(--green)">{{ champ.name.replace('Temporada ', '') }}</b>
              <span>{{ champ.champion_team_name }}</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
