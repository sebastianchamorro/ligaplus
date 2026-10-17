<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const supabase = useSupabaseClient()

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) {
  throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })
}
const leagueId = league.value.id

const { data: tournaments } = await useActiveTournaments(leagueId)
const { data: teams } = await useLeagueTeams(leagueId)
const activeTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'active'))

const selectedTournamentId = ref(tournaments.value?.[0]?.id ?? '')

const { data: matches, refresh: refreshMatches } = await useAsyncData(
  'admin-matches',
  async () => {
    if (!selectedTournamentId.value) return []
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, scheduled_at, matchday, status, home_score, away_score,' +
          'home_team:teams!matches_home_team_id_fkey(id, name),' +
          'away_team:teams!matches_away_team_id_fkey(id, name)'
      )
      .eq('tournament_id', selectedTournamentId.value)
      .order('scheduled_at')
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedTournamentId] }
)

const selectedMatchId = ref('')
watch(matches, (list) => {
  if (list?.length && !list.find((m) => m.id === selectedMatchId.value)) {
    selectedMatchId.value = list[0].id
  }
})

const selectedMatch = computed(() => matches.value?.find((m) => m.id === selectedMatchId.value) ?? null)

const { data: events, refresh: refreshEvents } = await useAsyncData(
  'admin-events',
  async () => {
    if (!selectedMatchId.value) return []
    const { data, error } = await supabase
      .from('match_events')
      .select('id, minute, type, team_id, player_id, player_in_id, player_out_id')
      .eq('match_id', selectedMatchId.value)
      .order('minute', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedMatchId] }
)

const minute = ref(1)
const type = ref<'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution'>('goal')
const eventTeamId = ref('')

async function saveEvent() {
  if (!selectedMatchId.value || !eventTeamId.value) return
  const { error } = await supabase.from('match_events').insert({
    match_id: selectedMatchId.value,
    minute: minute.value,
    type: type.value,
    team_id: eventTeamId.value
  })
  if (error) {
    alert(error.message)
    return
  }
  if (selectedMatch.value?.status !== 'finished') {
    await supabase.from('matches').update({ status: 'live' }).eq('id', selectedMatchId.value)
  }
  await Promise.all([refreshEvents(), refreshMatches()])
}

async function markFinished() {
  if (!selectedMatchId.value) return
  await supabase.from('matches').update({ status: 'finished' }).eq('id', selectedMatchId.value)
  await refreshMatches()
}

const newHomeId = ref('')
const newAwayId = ref('')
const newMatchday = ref(1)
const newDate = ref('')

async function createMatch() {
  if (!newHomeId.value || !newAwayId.value || newHomeId.value === newAwayId.value) return
  const { error } = await supabase.from('matches').insert({
    tournament_id: selectedTournamentId.value,
    home_team_id: newHomeId.value,
    away_team_id: newAwayId.value,
    matchday: newMatchday.value,
    scheduled_at: newDate.value || null,
    status: 'scheduled'
  })
  if (error) {
    alert(error.message)
    return
  }
  newHomeId.value = ''
  newAwayId.value = ''
  await refreshMatches()
}
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app · administración</span>
      <b>{{ league?.name }}</b>
    </div>
    <nav class="nav">
      <div class="brand">{{ league?.name?.toUpperCase() }}<br />ADMIN</div>
      <div class="navlinks">
        <NuxtLink :to="`/${leagueSlug}`">Vista pública</NuxtLink>
        <NuxtLink class="active" :to="`/${leagueSlug}/admin`">Administrar</NuxtLink>
      </div>
    </nav>

    <main class="shell">
      <div class="page-title">
        <div>
          <h1>Panel de administración</h1>
          <p class="muted">Cargá resultados y eventos de {{ league?.name }}.</p>
        </div>
        <span class="badge">Sin login todavía · Fase 1</span>
      </div>

      <div class="actionbar">
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

      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Cargar evento</h2>
            <span class="muted">Partido seleccionado</span>
          </div>
          <div class="panel-body">
            <div class="field">
              <label>Partido</label>
              <select v-model="selectedMatchId">
                <option v-for="m in matches" :key="m.id" :value="m.id">
                  {{ m.home_team.name }} vs {{ m.away_team.name }} ({{ m.status }})
                </option>
              </select>
            </div>
            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px">
              <div class="field">
                <label>Minuto</label>
                <input v-model.number="minute" type="number" />
              </div>
              <div class="field">
                <label>Equipo</label>
                <select v-model="eventTeamId">
                  <option v-if="selectedMatch" :value="selectedMatch.home_team.id">{{ selectedMatch.home_team.name }}</option>
                  <option v-if="selectedMatch" :value="selectedMatch.away_team.id">{{ selectedMatch.away_team.name }}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>Tipo de evento</label>
              <select v-model="type">
                <option value="goal">⚽ Gol</option>
                <option value="own_goal">⚽ Gol en contra</option>
                <option value="yellow_card">🟨 Tarjeta amarilla</option>
                <option value="red_card">🟥 Tarjeta roja</option>
                <option value="substitution">🔁 Cambio</option>
              </select>
            </div>
            <button class="btn" @click="saveEvent">Registrar evento</button>
            <button class="btn secondary" style="margin-left: 8px" @click="markFinished">Marcar finalizado</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Crear partido</h2>
            <span class="muted">{{ tournaments?.find((t) => t.id === selectedTournamentId)?.name }}</span>
          </div>
          <div class="panel-body">
            <div class="field">
              <label>Local</label>
              <select v-model="newHomeId">
                <option value="" disabled>Elegí un equipo</option>
                <option v-for="t in activeTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Visitante</label>
              <select v-model="newAwayId">
                <option value="" disabled>Elegí un equipo</option>
                <option v-for="t in activeTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px">
              <div class="field">
                <label>Fecha (matchday)</label>
                <input v-model.number="newMatchday" type="number" />
              </div>
              <div class="field">
                <label>Fecha y hora</label>
                <input v-model="newDate" type="datetime-local" />
              </div>
            </div>
            <button class="btn" @click="createMatch">Agregar al fixture</button>
            <div class="list" style="margin-top: 20px">
              <div v-for="m in matches" :key="m.id" class="item">
                <span>
                  <b>{{ m.home_team.name }} vs {{ m.away_team.name }}</b>
                  <small class="muted">Fecha {{ m.matchday }} · {{ m.home_score }}-{{ m.away_score }}</small>
                </span>
                <span class="badge">{{ m.status }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top: 20px">
        <div class="panel-head">
          <h2>Últimos eventos</h2>
          <span class="muted">Se reflejan en la vista pública</span>
        </div>
        <div class="panel-body">
          <div v-for="event in events" :key="event.id" class="item">
            <span><b>{{ event.type }}</b></span>
            <small class="muted">{{ event.minute }}'</small>
          </div>
          <p v-if="!events?.length" class="muted">Sin eventos cargados para este partido.</p>
        </div>
      </section>
    </main>
  </div>
</template>
