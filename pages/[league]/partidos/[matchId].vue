<script setup lang="ts">
const route = useRoute()
const leagueSlug = route.params.league as string
const matchId = route.params.matchId as string

const { data: league } = await useLeagueBySlug(leagueSlug)
if (!league.value) throw createError({ statusCode: 404, statusMessage: 'Liga no encontrada' })

const { data: match } = await useMatchById(matchId)
if (!match.value || match.value.tournament.league_id !== league.value.id) {
  throw createError({ statusCode: 404, statusMessage: 'Partido no encontrado' })
}

const { data: events } = await useMatchEvents(matchId, match.value.score_source === 'events')

const brokenLogos = reactive<Record<string, boolean>>({})
function onLogoError(id: string) { brokenLogos[id] = true }
function initials(team: { name: string; short_name?: string | null }) {
  return (team.short_name || team.name).slice(0, 2).toUpperCase()
}
function formatDate(iso: string | null) {
  if (!iso) return 'Fecha a confirmar'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })
}
const eventLabels: Record<string, string> = {
  goal: 'Gol', own_goal: 'Gol en contra', yellow_card: 'Tarjeta amarilla', red_card: 'Tarjeta roja', substitution: 'Cambio'
}
function eventPlayer(event: any) {
  if (event.type === 'substitution') {
    const names = [event.player_in?.full_name && `Entra ${event.player_in.full_name}`, event.player_out?.full_name && `Sale ${event.player_out.full_name}`].filter(Boolean)
    return names.join(' · ')
  }
  return event.player?.full_name ?? ''
}
</script>

<template>
  <div>
    <div class="topbar"><span>liga.futbol.app · {{ league?.name }}</span><b>Detalle del partido</b></div>
    <nav class="nav">
      <div class="brand"><Icon name="mdi:soccer" class="brand-mark" /><span class="brand-text">{{ league?.name?.toUpperCase() }}</span></div>
      <div class="navlinks-wrap"><div class="navlinks"><NuxtLink :to="`/${leagueSlug}#fixture`">Volver al fixture</NuxtLink></div></div>
    </nav>

    <main class="shell">
      <div class="page-title">
        <div><div class="hero-eyebrow">{{ match?.tournament.name }}</div><h1>Detalle del partido</h1><p class="muted">{{ formatDate(match?.scheduled_at ?? null) }}</p></div>
        <span class="badge" :class="match?.status">{{ match?.status === 'finished' ? 'Finalizado' : match?.status === 'postponed' ? 'Postergado' : match?.status === 'live' ? 'En vivo' : 'Programado' }}</span>
      </div>

      <section class="panel">
        <div class="panel-body" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; text-align: center">
          <div v-for="team in [match?.home_team, match?.away_team]" :key="team?.id">
            <div class="crest" style="width: 86px; height: 86px; margin: 0 auto 12px">
              <img v-if="team?.logo_url && !brokenLogos[team.id]" :src="team.logo_url" :alt="team.name" @error="onLogoError(team.id)" />
              <span v-else class="fallback">{{ team ? initials(team) : '?' }}</span>
            </div>
            <b>{{ team?.name }}</b>
          </div>
          <div><strong style="font-size: 38px; font-family: var(--font-display)">{{ match?.home_score }} - {{ match?.away_score }}</strong><div class="muted">Fecha {{ match?.matchday ?? 'a confirmar' }}</div></div>
        </div>
        <div class="panel-body" style="border-top: 1px solid var(--line); display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
          <div><small class="muted">Torneo</small><br><b>{{ match?.tournament.name }}</b></div>
          <div><small class="muted">Cancha</small><br><b>{{ match?.venue || 'Cancha a confirmar' }}</b></div>
          <div><small class="muted">Árbitro</small><br><b>{{ match?.referee?.full_name || 'Árbitro a confirmar' }}</b></div>
        </div>
      </section>

      <section v-if="match?.score_source === 'manual'" class="panel" style="margin-top: 24px"><div class="panel-body"><p class="muted"><Icon name="lucide:info" /> Resultado final cargado, sin detalle de eventos.</p></div></section>
      <section v-else class="panel" style="margin-top: 24px">
        <div class="panel-head"><h2>Detalle de eventos</h2><span class="muted">{{ events?.length ?? 0 }} registrados</span></div>
        <div class="panel-body list">
          <div v-for="event in events" :key="event.id" class="item event-row">
            <span class="badge">{{ event.minute }}<template v-if="event.extra_minute">+{{ event.extra_minute }}</template>'</span>
            <Icon name="lucide:circle-dot" class="event-icon" />
            <span><b>{{ eventLabels[event.type] }}</b><small>{{ event.team.name }}<template v-if="eventPlayer(event)"> · {{ eventPlayer(event) }}</template></small></span>
          </div>
          <p v-if="!events?.length" class="muted">Todavía no hay eventos registrados para este partido.</p>
        </div>
      </section>
      <NuxtLink class="btn secondary" style="margin-top: 24px" :to="`/${leagueSlug}#fixture`"><Icon name="lucide:arrow-left" /> Volver a la liga</NuxtLink>
    </main>
  </div>
</template>
