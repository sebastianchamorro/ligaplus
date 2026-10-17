<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const teamSlug = route.params.teamSlug as string

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })

const { data: club } = await useTeamBySlug(league.value.id, teamSlug)
if (!club.value) throw createError({ statusCode: 404, statusMessage: 'Club no encontrado' })

const { data: trophies } = await useTeamTrophies(club.value.id)
const { data: currentStandings } = await useTeamCurrentStandings(league.value.id, club.value.id)

const brokenLogo = ref(false)
onMounted(() => {
  nextTick(() => {
    const img = document.querySelector('.club-hero-crest img') as HTMLImageElement | null
    if (!img) return
    const check = () => {
      if (img.naturalWidth === 0) brokenLogo.value = true
    }
    if (img.complete) check()
    else {
      img.addEventListener('load', check, { once: true })
      img.addEventListener('error', check, { once: true })
    }
  })
})
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app · {{ league?.name }}</span>
      <b>Ficha de club</b>
    </div>
    <nav class="nav">
      <div class="brand">
        <span class="brand-mark">⚽</span>
        <span class="brand-text">{{ league?.name?.toUpperCase() }}</span>
      </div>
      <div class="navlinks-wrap">
        <div class="navlinks">
          <NuxtLink :to="`/${leagueSlug}`">Volver a la liga</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="shell">
      <section class="hero">
        <div class="hero-inner" style="display: flex; align-items: center; gap: 24px">
          <div class="crest club-hero-crest" style="width: 110px; height: 110px; flex-shrink: 0">
            <img v-if="club?.logo_url && !brokenLogo" :src="club.logo_url" :alt="club.name" />
            <span v-else class="fallback">{{ (club?.short_name || club?.name || '?').slice(0, 2).toUpperCase() }}</span>
          </div>
          <div>
            <div class="hero-eyebrow">{{ league?.name }}</div>
            <h1>{{ club?.name }}</h1>
            <p>{{ club?.status === 'active' ? 'Club activo de la liga.' : 'Club histórico - ya no participa actualmente.' }}</p>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="page-title">
          <div><h2>Historia</h2></div>
        </div>
        <section class="panel">
          <div class="panel-body">
            <p v-if="club?.history" style="white-space: pre-line">{{ club.history }}</p>
            <p v-else class="muted">Todavía no se cargó la historia de este club.</p>
          </div>
        </section>
      </section>

      <section class="section">
        <div class="page-title">
          <div>
            <h2>Desempeño en el torneo actual</h2>
            <p class="muted">Sólo se muestra mientras el torneo está en juego.</p>
          </div>
        </div>
        <div v-if="currentStandings?.length" class="grid">
          <section v-for="s in currentStandings" :key="s.tournament_id" class="panel">
            <div class="panel-head">
              <h2>{{ s.tournament_name }}</h2>
              <span class="pos" :class="{ gold: s.position === 1, silver: s.position === 2, bronze: s.position === 3 }">
                {{ s.position }}°
              </span>
            </div>
            <div class="panel-body" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center">
              <div><b style="font-size: 22px; display: block">{{ s.played }}</b><span class="muted">PJ</span></div>
              <div><b style="font-size: 22px; display: block">{{ s.won }}</b><span class="muted">Ganados</span></div>
              <div><b style="font-size: 22px; display: block">{{ s.points }}</b><span class="muted">Puntos</span></div>
              <div><b style="font-size: 22px; display: block">{{ s.goals_for }}</b><span class="muted">GF</span></div>
              <div><b style="font-size: 22px; display: block">{{ s.goals_against }}</b><span class="muted">GC</span></div>
              <div><b style="font-size: 22px; display: block">{{ s.goal_difference }}</b><span class="muted">DG</span></div>
            </div>
          </section>
        </div>
        <section v-else class="panel">
          <div class="panel-body">
            <p class="muted">{{ club?.name }} no participa de ningún torneo en juego actualmente.</p>
          </div>
        </section>
      </section>

      <section class="section">
        <div class="page-title">
          <div>
            <h2>Palmarés</h2>
            <p class="muted">{{ trophies?.length ?? 0 }} título{{ trophies?.length === 1 ? '' : 's' }}</p>
          </div>
        </div>
        <section v-if="trophies?.length" class="champs-panel panel">
          <div class="champs-grid">
            <div v-for="t in trophies" :key="t.tournament_id" class="champ-row">
              <b>{{ t.name.replace('Temporada ', '') }}</b>
              <span>🏆</span>
            </div>
          </div>
        </section>
        <section v-else class="panel">
          <div class="panel-body">
            <p class="muted">{{ club?.name }} todavía no ganó ningún torneo registrado.</p>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
