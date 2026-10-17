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

// Puramente visual: si la imagen del escudo no carga (404, URL rota), mostramos
// el fallback con iniciales en vez del ícono roto del navegador. No afecta los datos.
// Como la página es server-rendered, el navegador puede intentar (y fallar) la carga
// de la imagen antes de que Vue hidrate y enganche el listener @error, así que además
// revisamos img.complete/naturalWidth apenas se monta el componente.
const brokenLogos = reactive<Record<string, boolean>>({})
function onLogoError(id: string) {
  brokenLogos[id] = true
}

onMounted(() => {
  nextTick(() => {
    document.querySelectorAll('.crest img[data-logo-id]').forEach((el) => {
      const img = el as HTMLImageElement
      const id = img.getAttribute('data-logo-id')
      if (!id) return
      const check = () => {
        if (img.naturalWidth === 0) onLogoError(id)
      }
      if (img.complete) {
        check()
      } else {
        img.addEventListener('load', check, { once: true })
        img.addEventListener('error', check, { once: true })
      }
    })
  })
})

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
      <div class="brand">
        <span class="brand-mark">⚽</span>
        <span class="brand-text">{{ league?.name?.toUpperCase() }}</span>
      </div>
      <div class="navlinks-wrap">
        <div class="navlinks">
          <a href="#tabla">Tabla</a>
          <a href="#fixture">Fixture</a>
          <a href="#clubes">Clubes</a>
          <a href="#historia">Historia</a>
          <NuxtLink :to="`/${leagueSlug}/admin`">Administrar</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="shell">
      <section class="hero">
        <div class="hero-inner">
          <div>
            <div class="hero-eyebrow">{{ league?.name }}</div>
            <h1>Fútbol con historia.</h1>
            <p>La información oficial de la liga: tabla de posiciones, próximos partidos, clubes y seis décadas de campeones.</p>
            <NuxtLink class="btn" :to="`/${leagueSlug}/admin`">Ir al panel admin</NuxtLink>
          </div>
        </div>
        <div class="stat-strip">
          <div class="stat">
            <b>{{ String(activeTeams.length).padStart(2, '0') }}</b>
            <span>Clubes activos</span>
          </div>
          <div class="stat">
            <b>{{ String(champions?.length ?? 0).padStart(2, '0') }}</b>
            <span>Títulos en la historia</span>
          </div>
          <div class="stat">
            <b>{{ String(tournaments?.length ?? 0).padStart(2, '0') }}</b>
            <span>Torneos en juego</span>
          </div>
        </div>
      </section>

      <div v-if="tournaments?.length" class="tournament-switcher">
        <span class="tournament-switcher-label">Torneo:</span>
        <div class="pills">
          <button
            v-for="t in tournaments"
            :key="t.id"
            class="pill"
            :class="{ active: t.id === selectedTournamentId }"
            @click="selectedTournamentId = t.id"
          >
            {{ t.name }}
          </button>
        </div>
      </div>
      <p v-else class="muted">Esta liga todavía no tiene torneos en juego.</p>

      <section id="tabla" class="section">
        <div class="page-title">
          <div>
            <h2>Tabla de posiciones</h2>
            <p class="muted">{{ selectedTournament?.name ?? 'Sin torneo seleccionado' }}</p>
          </div>
        </div>
        <div class="grid">
          <section class="panel">
            <div class="table-scroll">
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
                    <td>
                      <span class="pos" :class="{ gold: i === 0, silver: i === 1, bronze: i === 2 }">{{ i + 1 }}</span>
                    </td>
                    <td><b>{{ row.team_name }}</b></td>
                    <td>{{ row.played }}</td>
                    <td>{{ row.won }}</td>
                    <td>{{ row.goal_difference }}</td>
                    <td>{{ row.points }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="!standings?.length" class="empty">Todavía no hay partidos jugados en este torneo.</p>
          </section>

          <section id="fixture" class="panel">
            <div class="panel-head">
              <h2>Próximos partidos</h2>
              <span class="muted">{{ selectedTournament?.name }}</span>
            </div>
            <div class="panel-body list">
              <div v-for="game in fixture" :key="game.id" class="item">
                <span>
                  <b>{{ game.home_team.name }} vs {{ game.away_team.name }}</b>
                  <small>{{ formatKickoff(game.scheduled_at) }} · Fecha {{ game.matchday }}</small>
                </span>
                <span class="badge scheduled">Programado</span>
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
          <div v-for="club in activeTeams" :key="club.id" class="card">
            <div class="crest">
              <img
                v-if="club.logo_url && !brokenLogos[club.id]"
                :src="club.logo_url"
                :alt="club.name"
                :data-logo-id="club.id"
                @error="onLogoError(club.id)"
              />
              <span v-else class="fallback">{{ (club.short_name || club.name).slice(0, 2).toUpperCase() }}</span>
            </div>
            <h3>{{ club.name }}</h3>
            <p>Actual</p>
          </div>
        </div>

        <template v-if="historicTeams.length">
          <div class="subsection-label">Clubes históricos</div>
          <div class="cards">
            <div v-for="club in historicTeams" :key="club.id" class="card historic-card">
              <div class="crest">
                <img
                  v-if="club.logo_url && !brokenLogos[club.id]"
                  :src="club.logo_url"
                  :alt="club.name"
                  :data-logo-id="club.id"
                  @error="onLogoError(club.id)"
                />
                <span v-else class="fallback">{{ (club.short_name || club.name).slice(0, 2).toUpperCase() }}</span>
              </div>
              <h3>{{ club.name }}</h3>
              <p>No existe actualmente</p>
            </div>
          </div>
        </template>
      </section>

      <section id="historia" class="section">
        <div class="page-title">
          <div>
            <h2>Historia de {{ league?.name }}</h2>
            <p class="muted">Campeones oficiales · del más reciente al más antiguo</p>
          </div>
        </div>
        <section class="champs-panel panel">
          <div class="panel-head">
            <h2>Campeones oficiales</h2>
            <span class="muted">{{ champions?.length ?? 0 }} títulos registrados</span>
          </div>
          <div class="champs-grid">
            <div
              v-for="(champ, i) in champions"
              :key="champ.tournament_id"
              class="champ-row"
              :class="{ current: i === 0 }"
            >
              <span v-if="i === 0" class="tag-current">Vigente</span>
              <b>{{ champ.name.replace('Temporada ', '') }}</b>
              <span>{{ champ.champion_team_name }}</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
