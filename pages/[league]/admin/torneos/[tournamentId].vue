<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const tournamentId = route.params.tournamentId as string
const supabase = useSupabaseClient()

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })
const leagueId = league.value.id

const { data: tournaments } = await useAllTournaments(leagueId)
const tournament = computed(() => tournaments.value?.find((t) => t.id === tournamentId) ?? null)

const { data: teams } = await useLeagueTeams(leagueId)
const { data: referees, refresh: refreshReferees } = await useLeagueReferees(leagueId)

// Sólo los equipos que participan de ESTE torneo (no todos los de la liga).
const { data: tournamentTeamIds } = await useAsyncData(`tournament-team-ids:${tournamentId}`, async () => {
  const { data, error } = await supabase
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', tournamentId)
  if (error) throw error
  return (data ?? []).map((r) => r.team_id)
})
const tournamentTeams = computed(() =>
  (teams.value ?? []).filter((t) => tournamentTeamIds.value?.includes(t.id))
)

const { data: matches, refresh: refreshMatches } = await useAsyncData(
  `admin-matches:${tournamentId}`,
  async () => {
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, scheduled_at, matchday, status, home_score, away_score, score_source, referee_id,' +
          'home_team:teams!matches_home_team_id_fkey(id, name),' +
          'away_team:teams!matches_away_team_id_fkey(id, name)'
      )
      .eq('tournament_id', tournamentId)
      .order('matchday')
      .order('scheduled_at')
    if (error) throw error
    return data ?? []
  }
)

const matchesByMatchday = computed(() => {
  const groups = new Map<number, typeof matches.value>()
  for (const m of matches.value ?? []) {
    const key = m.matchday ?? 0
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0])
})

function refereeName(id: string | null) {
  if (!id) return null
  return referees.value?.find((r) => r.id === id)?.full_name ?? null
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  live: 'En vivo',
  finished: 'Finalizado',
  postponed: 'Postergado'
}
function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status
}

const EVENT_LABELS: Record<string, string> = {
  goal: 'Gol',
  own_goal: 'Gol en contra',
  yellow_card: 'Tarjeta amarilla',
  red_card: 'Tarjeta roja',
  substitution: 'Cambio'
}

// ===== Selección de partido activo =====
const selectedMatchId = ref('')
watch(
  matches,
  (list) => {
    if (list?.length && !list.find((m) => m.id === selectedMatchId.value)) {
      selectedMatchId.value = list[0].id
    }
  },
  { immediate: true }
)
const selectedMatch = computed(() => matches.value?.find((m) => m.id === selectedMatchId.value) ?? null)

const { data: events, refresh: refreshEvents } = await useAsyncData(
  'admin-events',
  async () => {
    if (!selectedMatchId.value) return []
    const { data, error } = await supabase
      .from('match_events')
      .select('id, minute, type, team_id, player_id, player_in_id, player_out_id, player:players!match_events_player_id_fkey(full_name), player_in:players!match_events_player_in_id_fkey(full_name), player_out:players!match_events_player_out_id_fkey(full_name)')
      .eq('match_id', selectedMatchId.value)
      .order('minute', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedMatchId] }
)

// ===== Modo 1: cargar evento a evento (el resultado se deriva solo) =====
const minute = ref(1)
const eventType = ref<'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution'>('goal')
const eventTeamId = ref('')
const playerId = ref('')
const playerInId = ref('')
const playerOutId = ref('')
const { data: eventPlayers } = useTeamPlayers(eventTeamId)
const eventPlayerName = (id: string | null) => eventPlayers.value?.find((p) => p.id === id)?.full_name ?? null
watch([eventTeamId, eventType], () => {
  playerId.value = ''
  playerInId.value = ''
  playerOutId.value = ''
})

async function saveEvent() {
  if (!selectedMatchId.value || !eventTeamId.value) return
  if (selectedMatch.value?.score_source === 'manual') {
    if (!confirm('Este partido tiene el resultado cargado a mano. El evento se va a guardar pero NO va a recalcular el marcador. ¿Continuar?')) return
  }
  const { error } = await supabase.from('match_events').insert({
    match_id: selectedMatchId.value,
    minute: minute.value,
    type: eventType.value,
    team_id: eventTeamId.value,
    player_id: eventType.value === 'substitution' ? null : playerId.value || null,
    player_in_id: eventType.value === 'substitution' ? playerInId.value || null : null,
    player_out_id: eventType.value === 'substitution' ? playerOutId.value || null : null
  })
  if (error) return alert(error.message)
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

// ===== Modo 2: cargar sólo el resultado final, sin eventos =====
const quickHome = ref(0)
const quickAway = ref(0)
watch(selectedMatch, (m) => {
  quickHome.value = m?.home_score ?? 0
  quickAway.value = m?.away_score ?? 0
}, { immediate: true })

async function saveQuickResult() {
  if (!selectedMatchId.value) return
  const { error } = await supabase
    .from('matches')
    .update({
      status: 'finished',
      score_source: 'manual',
      home_score: quickHome.value,
      away_score: quickAway.value
    })
    .eq('id', selectedMatchId.value)
  if (error) return alert(error.message)
  await refreshMatches()
}

// ===== Crear partido =====
const newHomeId = ref('')
const newAwayId = ref('')
const newMatchday = ref((matches.value?.[matches.value.length - 1]?.matchday ?? 0) + 1)
const newDate = ref('')
const newRefereeId = ref('')

async function createMatch() {
  if (!newHomeId.value || !newAwayId.value || newHomeId.value === newAwayId.value) return
  const { error } = await supabase.from('matches').insert({
    tournament_id: tournamentId,
    home_team_id: newHomeId.value,
    away_team_id: newAwayId.value,
    matchday: newMatchday.value,
    scheduled_at: newDate.value || null,
    referee_id: newRefereeId.value || null,
    status: 'scheduled'
  })
  if (error) return alert(error.message)
  newHomeId.value = ''
  newAwayId.value = ''
  newRefereeId.value = ''
  await refreshMatches()
}

const newRefereeName = ref('')
async function addReferee() {
  if (!newRefereeName.value.trim()) return
  const { error } = await supabase
    .from('referees')
    .insert({ league_id: leagueId, full_name: newRefereeName.value.trim() })
  if (error) return alert(error.message)
  newRefereeName.value = ''
  await refreshReferees()
}

function formatKickoff(iso: string | null) {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app · administración</span>
      <b>{{ league?.name }}</b>
    </div>
    <nav class="nav">
      <div class="brand">
        <Icon name="mdi:soccer" class="brand-mark" />
        <span class="brand-text">{{ league?.name?.toUpperCase() }}<span class="kicker">Admin</span></span>
      </div>
      <div class="navlinks-wrap">
        <div class="navlinks">
          <NuxtLink :to="`/${leagueSlug}`">Vista pública</NuxtLink>
          <NuxtLink :to="`/${leagueSlug}/admin`">Torneos</NuxtLink>
          <NuxtLink :to="`/${leagueSlug}/admin/equipos`">Equipos</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="shell">
      <div class="page-title">
        <div>
          <h1>{{ tournament?.name ?? 'Torneo' }}</h1>
          <p class="muted">{{ tournamentTeams.length }} equipos participantes</p>
        </div>
        <span class="badge" :class="tournament?.status">{{ statusLabel(tournament?.status ?? '') }}</span>
      </div>

      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Partidos por fecha</h2>
            <span class="muted">Click en un partido para cargarle evento o resultado</span>
          </div>
          <div class="panel-body list">
            <template v-for="[matchday, group] in matchesByMatchday" :key="matchday">
              <div class="subsection-label">Fecha {{ matchday }}</div>
              <div
                v-for="m in group"
                :key="m.id"
                class="item"
                :class="{ selected: m.id === selectedMatchId }"
                style="cursor: pointer"
                @click="selectedMatchId = m.id"
              >
                <span>
                  <b>{{ m.home_team.name }} {{ m.home_score }}-{{ m.away_score }} {{ m.away_team.name }}</b>
                  <small>
                    {{ formatKickoff(m.scheduled_at) }}
                    <template v-if="refereeName(m.referee_id)"> · Árbitro: {{ refereeName(m.referee_id) }}</template>
                  </small>
                </span>
                <span class="badge" :class="m.status">{{ statusLabel(m.status) }}</span>
              </div>
            </template>
            <p v-if="!matches?.length" class="muted">Todavía no hay partidos en este torneo.</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Crear partido</h2>
          </div>
          <div class="panel-body">
            <div class="field">
              <label>Local</label>
              <select v-model="newHomeId">
                <option value="" disabled>Elegí un equipo</option>
                <option v-for="t in tournamentTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Visitante</label>
              <select v-model="newAwayId">
                <option value="" disabled>Elegí un equipo</option>
                <option v-for="t in tournamentTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="grid grid-2">
              <div class="field">
                <label>Fecha (matchday)</label>
                <input v-model.number="newMatchday" type="number" />
              </div>
              <div class="field">
                <label>Fecha y hora</label>
                <input v-model="newDate" type="datetime-local" />
              </div>
            </div>
            <div class="field">
              <label>Árbitro (opcional)</label>
              <select v-model="newRefereeId">
                <option value="">Sin árbitro</option>
                <option v-for="r in referees" :key="r.id" :value="r.id">{{ r.full_name }}</option>
              </select>
            </div>
            <button class="btn" @click="createMatch">Agregar al fixture</button>

            <div class="field" style="margin-top: 16px">
              <label>Agregar árbitro nuevo (opcional)</label>
              <div style="display: flex; gap: 8px">
                <input v-model="newRefereeName" placeholder="Nombre del árbitro" style="flex: 1" />
                <button class="btn secondary" @click="addReferee">Agregar</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="grid" style="margin-top: 20px">
        <section class="panel">
          <div class="panel-head">
            <h2>Cargar evento</h2>
            <span class="muted">{{ selectedMatch ? `${selectedMatch.home_team.name} vs ${selectedMatch.away_team.name}` : 'Elegí un partido' }}</span>
          </div>
          <div class="panel-body">
            <p class="muted">El resultado se calcula solo a partir de los goles cargados acá.</p>
            <div class="grid grid-2">
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
              <select v-model="eventType">
                <option value="goal">Gol</option>
                <option value="own_goal">Gol en contra</option>
                <option value="yellow_card">Tarjeta amarilla</option>
                <option value="red_card">Tarjeta roja</option>
                <option value="substitution">Cambio</option>
              </select>
            </div>
            <div v-if="eventType !== 'substitution'" class="field">
              <label>Jugador (opcional)</label>
              <select v-model="playerId" :disabled="!eventPlayers?.length">
                <option value="">{{ eventPlayers?.length ? 'Sin jugador' : 'No hay jugadores cargados' }}</option>
                <option v-for="player in eventPlayers" :key="player.id" :value="player.id">{{ player.shirt_number ?? '-' }} · {{ player.full_name }}</option>
              </select>
            </div>
            <div v-else class="grid grid-2">
              <div class="field"><label>Jugador que entra (opcional)</label><select v-model="playerInId" :disabled="!eventPlayers?.length"><option value="">{{ eventPlayers?.length ? 'Sin jugador' : 'No hay jugadores cargados' }}</option><option v-for="player in eventPlayers" :key="player.id" :value="player.id">{{ player.shirt_number ?? '-' }} · {{ player.full_name }}</option></select></div>
              <div class="field"><label>Jugador que sale (opcional)</label><select v-model="playerOutId" :disabled="!eventPlayers?.length"><option value="">{{ eventPlayers?.length ? 'Sin jugador' : 'No hay jugadores cargados' }}</option><option v-for="player in eventPlayers" :key="player.id" :value="player.id">{{ player.shirt_number ?? '-' }} · {{ player.full_name }}</option></select></div>
            </div>
            <div class="actionbar">
              <button class="btn" :disabled="!selectedMatchId" @click="saveEvent">Registrar evento</button>
              <button class="btn secondary" :disabled="!selectedMatchId" @click="markFinished">Marcar finalizado</button>
            </div>
            <div class="panel-body list" style="padding: 0; margin-top: 16px">
              <div v-for="event in events" :key="event.id" class="item">
                <span>{{ EVENT_LABELS[event.type] ?? event.type }}<small v-if="event.type === 'substitution'"> · {{ event.player_in?.full_name ?? 'Sin jugador' }} entra / {{ event.player_out?.full_name ?? 'sin jugador' }} sale</small><small v-else-if="event.player_id"> · {{ event.player?.full_name ?? 'Jugador no disponible' }}</small></span>
                <small>{{ event.minute }}'</small>
              </div>
              <p v-if="!events?.length" class="muted">Sin eventos cargados para este partido.</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Cargar sólo el resultado</h2>
            <span class="muted">Sin detalle de eventos</span>
          </div>
          <div class="panel-body">
            <p class="muted">
              Para cuando no se quiere cargar minuto a minuto: pone el resultado final y la tabla de
              posiciones se actualiza igual (3 puntos al ganador, 1 a cada uno si empatan, 0 al que pierde).
            </p>
            <div class="grid grid-2">
              <div class="field">
                <label>{{ selectedMatch?.home_team.name ?? 'Local' }}</label>
                <input v-model.number="quickHome" type="number" min="0" />
              </div>
              <div class="field">
                <label>{{ selectedMatch?.away_team.name ?? 'Visitante' }}</label>
                <input v-model.number="quickAway" type="number" min="0" />
              </div>
            </div>
            <button class="btn" :disabled="!selectedMatchId" @click="saveQuickResult">Guardar resultado final</button>
            <p v-if="selectedMatch?.score_source === 'manual'" class="muted" style="margin-top: 8px">
              Este partido está en modo resultado manual.
            </p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
