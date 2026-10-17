<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const supabase = useSupabaseClient()

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })
const leagueId = league.value.id

const { data: tournaments, refresh: refreshTournaments } = await useAllTournaments(leagueId)
const openTournaments = computed(() => (tournaments.value ?? []).filter((t) => t.status !== 'finished'))
const finishedTournaments = computed(() => (tournaments.value ?? []).filter((t) => t.status === 'finished'))
const { data: teams } = await useLeagueTeams(leagueId)
const activeTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'active'))

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'Próximo',
  in_progress: 'En juego',
  finished: 'Finalizado'
}

const newName = ref('')
const newStatus = ref<'upcoming' | 'in_progress'>('upcoming')
const newStart = ref('')
const newEnd = ref('')
const newTeamIds = ref<string[]>([])

async function createTournament() {
  if (!newName.value.trim() || !newTeamIds.value.length) return
  const { data: created, error } = await supabase
    .from('tournaments')
    .insert({
      league_id: leagueId,
      name: newName.value.trim(),
      status: newStatus.value,
      start_date: newStart.value || null,
      end_date: newEnd.value || null
    })
    .select('id')
    .single()
  if (error) return alert(error.message)

  const rows = newTeamIds.value.map((team_id) => ({ tournament_id: created.id, team_id }))
  const { error: teamsError } = await supabase.from('tournament_teams').insert(rows)
  if (teamsError) return alert(teamsError.message)

  newName.value = ''
  newStart.value = ''
  newEnd.value = ''
  newTeamIds.value = []
  await refreshTournaments()
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
        <span class="brand-mark">⚽</span>
        <span class="brand-text">{{ league?.name?.toUpperCase() }}<span class="kicker">Admin</span></span>
      </div>
      <div class="navlinks-wrap">
        <div class="navlinks">
          <NuxtLink :to="`/${leagueSlug}`">Vista pública</NuxtLink>
          <NuxtLink class="active" :to="`/${leagueSlug}/admin`">Torneos</NuxtLink>
          <NuxtLink :to="`/${leagueSlug}/admin/equipos`">Equipos</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="shell">
      <div class="page-title">
        <div>
          <h1>Torneos de {{ league?.name }}</h1>
          <p class="muted">Una liga puede tener varios torneos a la vez, cada uno con sus propios equipos.</p>
        </div>
        <span class="badge dev">Sin login todavía · Fase 1</span>
      </div>

      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Torneos existentes</h2>
          </div>
          <div class="panel-body list">
            <NuxtLink
              v-for="t in openTournaments"
              :key="t.id"
              :to="`/${leagueSlug}/admin/torneos/${t.id}`"
              class="item"
            >
              <span><b>{{ t.name }}</b></span>
              <span class="badge" :class="t.status">{{ STATUS_LABELS[t.status] ?? t.status }}</span>
            </NuxtLink>
            <p v-if="!openTournaments.length" class="muted">No hay torneos en juego o próximos.</p>

            <details v-if="finishedTournaments.length" style="margin-top: 8px">
              <summary class="muted" style="cursor: pointer">
                Ver {{ finishedTournaments.length }} torneos finalizados (incluye historia)
              </summary>
              <div class="list" style="margin-top: 10px">
                <NuxtLink
                  v-for="t in finishedTournaments"
                  :key="t.id"
                  :to="`/${leagueSlug}/admin/torneos/${t.id}`"
                  class="item"
                >
                  <span><b>{{ t.name }}</b></span>
                  <span class="badge finished">Finalizado</span>
                </NuxtLink>
              </div>
            </details>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Crear torneo</h2>
          </div>
          <div class="panel-body">
            <div class="field">
              <label>Nombre</label>
              <input v-model="newName" placeholder="Ej. Copa Verano 2027" />
            </div>
            <div class="grid grid-2">
              <div class="field">
                <label>Inicio</label>
                <input v-model="newStart" type="date" />
              </div>
              <div class="field">
                <label>Fin</label>
                <input v-model="newEnd" type="date" />
              </div>
            </div>
            <div class="field">
              <label>Estado</label>
              <select v-model="newStatus">
                <option value="upcoming">Próximo</option>
                <option value="in_progress">En juego</option>
              </select>
            </div>
            <div class="field">
              <label>Equipos participantes</label>
              <div class="checklist">
                <label v-for="t in activeTeams" :key="t.id" class="checklist-item">
                  <input v-model="newTeamIds" type="checkbox" :value="t.id" />
                  {{ t.name }}
                </label>
              </div>
            </div>
            <button class="btn" @click="createTournament">Crear torneo</button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
