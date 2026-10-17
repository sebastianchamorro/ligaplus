<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const supabase = useSupabaseClient()

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })
const leagueId = league.value.id

const { data: teams, refresh: refreshTeams } = await useLeagueTeams(leagueId)
const activeTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'active'))

const selectedTeamId = ref(activeTeams.value[0]?.id ?? '')
const selectedTeam = computed(() => teams.value?.find((t) => t.id === selectedTeamId.value) ?? null)

// Subida de escudo: acepta cualquier formato (jpg, captura, foto), el server lo
// normaliza a PNG. Si el resultado no queda bien (foto de mala calidad, fondo feo),
// se puede descargar el actual, editarlo afuera y volver a subirlo las veces que haga falta.
const uploadingLogo = ref(false)
async function uploadLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedTeamId.value) return
  uploadingLogo.value = true
  try {
    const formData = new FormData()
    formData.append('target', 'team')
    formData.append('id', selectedTeamId.value)
    formData.append('file', file)
    await $fetch('/api/upload-logo', { method: 'POST', body: formData })
    await refreshTeams()
  } catch (err: any) {
    alert(err?.data?.statusMessage || err?.message || 'Error al subir el escudo')
  } finally {
    uploadingLogo.value = false
    input.value = ''
  }
}

const historyDraft = ref('')
watch(
  selectedTeam,
  (t) => {
    historyDraft.value = t?.history ?? ''
  },
  { immediate: true }
)
const savingHistory = ref(false)
async function saveHistory() {
  if (!selectedTeamId.value) return
  savingHistory.value = true
  try {
    const { error } = await supabase
      .from('teams')
      .update({ history: historyDraft.value || null })
      .eq('id', selectedTeamId.value)
    if (error) throw error
    await refreshTeams()
  } catch (err: any) {
    alert(err?.message || 'Error al guardar la historia')
  } finally {
    savingHistory.value = false
  }
}

const { data: players, refresh: refreshPlayers } = await useAsyncData(
  'admin-players',
  async () => {
    if (!selectedTeamId.value) return []
    const { data, error } = await supabase
      .from('players')
      .select('id, team_id, full_name, shirt_number, position, photo_url')
      .eq('team_id', selectedTeamId.value)
      .order('shirt_number')
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedTeamId] }
)

const { data: staff, refresh: refreshStaff } = await useAsyncData(
  'admin-staff',
  async () => {
    if (!selectedTeamId.value) return []
    const { data, error } = await supabase
      .from('team_staff')
      .select('id, team_id, full_name, role')
      .eq('team_id', selectedTeamId.value)
      .order('full_name')
    if (error) throw error
    return data ?? []
  },
  { watch: [selectedTeamId] }
)

const newPlayerName = ref('')
const newPlayerNumber = ref<number | null>(null)
const newPlayerPosition = ref('')
const uploadingPlayerId = ref<string | null>(null)

async function uploadPlayerPhoto(playerId: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingPlayerId.value = playerId
  try {
    const formData = new FormData()
    formData.append('target', 'player')
    formData.append('id', playerId)
    formData.append('file', file)
    await $fetch('/api/upload-logo', { method: 'POST', body: formData })
    await refreshPlayers()
  } catch (err: any) {
    alert(err?.data?.statusMessage || err?.message || 'Error al subir la foto')
  } finally {
    uploadingPlayerId.value = null
    input.value = ''
  }
}

async function addPlayer() {
  if (!selectedTeamId.value || !newPlayerName.value.trim()) return
  const { error } = await supabase.from('players').insert({
    team_id: selectedTeamId.value,
    full_name: newPlayerName.value.trim(),
    shirt_number: newPlayerNumber.value,
    position: newPlayerPosition.value || null
  })
  if (error) return alert(error.message)
  newPlayerName.value = ''
  newPlayerNumber.value = null
  newPlayerPosition.value = ''
  await refreshPlayers()
}

async function removePlayer(id: string) {
  await supabase.from('players').delete().eq('id', id)
  await refreshPlayers()
}

const newStaffName = ref('')
const newStaffRole = ref('')

async function addStaff() {
  if (!selectedTeamId.value || !newStaffName.value.trim() || !newStaffRole.value.trim()) return
  const { error } = await supabase.from('team_staff').insert({
    team_id: selectedTeamId.value,
    full_name: newStaffName.value.trim(),
    role: newStaffRole.value.trim()
  })
  if (error) return alert(error.message)
  newStaffName.value = ''
  newStaffRole.value = ''
  await refreshStaff()
}

async function removeStaff(id: string) {
  await supabase.from('team_staff').delete().eq('id', id)
  await refreshStaff()
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
          <NuxtLink class="active" :to="`/${leagueSlug}/admin/equipos`">Equipos</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="shell">
      <div class="page-title">
        <div>
          <h1>Equipos</h1>
          <p class="muted">Jugadores y cuerpo técnico (opcional) por club.</p>
        </div>
      </div>

      <div class="pills">
        <button
          v-for="t in activeTeams"
          :key="t.id"
          class="pill"
          :class="{ active: t.id === selectedTeamId }"
          @click="selectedTeamId = t.id"
        >
          {{ t.name }}
        </button>
      </div>

      <section class="panel" style="margin-bottom: 20px">
        <div class="panel-head">
          <h2>Escudo</h2>
          <span class="muted">{{ selectedTeam?.name }}</span>
        </div>
        <div class="panel-body" style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap">
          <div class="crest" style="width: 90px; height: 90px; flex-shrink: 0">
            <img v-if="selectedTeam?.logo_url" :src="selectedTeam.logo_url" :alt="selectedTeam.name" />
            <span v-else class="fallback">{{ (selectedTeam?.short_name || selectedTeam?.name || '?').slice(0, 2).toUpperCase() }}</span>
          </div>
          <div class="field" style="flex: 1; min-width: 220px">
            <label>Subir escudo nuevo (cualquier formato - se convierte a PNG solo)</label>
            <input type="file" accept="image/*" :disabled="uploadingLogo" @change="uploadLogo" />
            <p class="muted" style="margin-top: 6px">
              Si la foto queda fea (fondo, recorte), descargá la actual, editala vos y subila de nuevo las veces que haga falta.
            </p>
            <a v-if="selectedTeam?.logo_url" :href="selectedTeam.logo_url" target="_blank" class="muted">Ver/descargar escudo actual →</a>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-bottom: 20px">
        <div class="panel-head">
          <h2>Historia</h2>
          <span class="muted">Se muestra en la ficha pública del club</span>
        </div>
        <div class="panel-body">
          <textarea
            v-model="historyDraft"
            rows="5"
            placeholder="Fundación, apodos, rivalidades, hechos destacados..."
            style="width: 100%; font-family: inherit; font-size: 14px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-sm, 8px)"
          ></textarea>
          <button class="btn" style="margin-top: 10px" :disabled="savingHistory" @click="saveHistory">Guardar historia</button>
        </div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Jugadores</h2>
            <span class="muted">{{ selectedTeam?.name }}</span>
          </div>
          <div class="panel-body">
            <div class="grid grid-2">
              <div class="field">
                <label>Nombre</label>
                <input v-model="newPlayerName" placeholder="Nombre completo" />
              </div>
              <div class="field">
                <label>Dorsal</label>
                <input v-model.number="newPlayerNumber" type="number" />
              </div>
            </div>
            <div class="field">
              <label>Posición (opcional)</label>
              <input v-model="newPlayerPosition" placeholder="Ej. Defensor" />
            </div>
            <button class="btn" @click="addPlayer">Agregar jugador</button>

            <div class="panel-body list" style="padding: 0; margin-top: 16px">
              <div v-for="p in players" :key="p.id" class="item">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0">
                  <div class="crest" style="width: 52px; height: 64px; border-radius: 10px; margin: 0; flex-shrink: 0">
                    <img v-if="p.photo_url" :src="p.photo_url" :alt="p.full_name" style="padding: 0; object-fit: cover" />
                    <span v-else class="fallback" style="font-size: 18px">{{ p.full_name.slice(0, 2).toUpperCase() }}</span>
                  </div>
                  <span>
                  <b>{{ p.shirt_number ?? '-' }} · {{ p.full_name }}</b>
                  <small v-if="p.position">{{ p.position }}</small>
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
                  <label class="btn secondary" style="cursor: pointer">
                    {{ uploadingPlayerId === p.id ? 'Subiendo…' : (p.photo_url ? 'Cambiar foto' : 'Subir foto') }}
                    <input type="file" accept="image/*" :disabled="uploadingPlayerId === p.id" style="display: none" @change="uploadPlayerPhoto(p.id, $event)" />
                  </label>
                  <button class="btn secondary" @click="removePlayer(p.id)">Quitar</button>
                </div>
              </div>
              <p v-if="!players?.length" class="muted">Sin jugadores cargados.</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Cuerpo técnico</h2>
            <span class="muted">{{ selectedTeam?.name }}</span>
          </div>
          <div class="panel-body">
            <div class="grid grid-2">
              <div class="field">
                <label>Nombre</label>
                <input v-model="newStaffName" placeholder="Nombre completo" />
              </div>
              <div class="field">
                <label>Rol</label>
                <input v-model="newStaffRole" placeholder="Ej. Director Técnico" />
              </div>
            </div>
            <button class="btn" @click="addStaff">Agregar al cuerpo técnico</button>

            <div class="panel-body list" style="padding: 0; margin-top: 16px">
              <div v-for="s in staff" :key="s.id" class="item">
                <span>
                  <b>{{ s.full_name }}</b>
                  <small>{{ s.role }}</small>
                </span>
                <button class="btn secondary" @click="removeStaff(s.id)">Quitar</button>
              </div>
              <p v-if="!staff?.length" class="muted">Sin cuerpo técnico cargado.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
