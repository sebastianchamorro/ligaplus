<script setup lang="ts">
type Category = { label: string; commits: number; additions: number; deletions: number }
type Stats = { generatedAt: string; totalCommits: number; firstCommitDate: string; latestCommitDate: string; elapsedDays: number; elapsedHours: number; totalAdditions: number; totalDeletions: number; uniqueFiles: number; categories: Record<string, Category>; diary: { hash: string; date: string; subject: string }[]; current: { migrations: number; pages: number; apiRoutes: number; composables: number } }
const { data: stats } = await useFetch<Stats>('/api/dev-stats')
const date = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
const number = (value: number) => new Intl.NumberFormat('es-AR').format(value)
const elapsed = (s: Stats) => (s.elapsedDays >= 1 ? `${s.elapsedDays} día${s.elapsedDays === 1 ? '' : 's'}` : `${s.elapsedHours} hora${s.elapsedHours === 1 ? '' : 's'}`)
const categories = computed(() => Object.entries(stats.value?.categories ?? {}).map(([key, value]) => ({ key, ...value })))
const maxCommits = computed(() => Math.max(...categories.value.map((c) => c.commits), 1))
</script>

<template>
  <div class="behind-page">
    <div class="topbar"><span>liga.futbol.app</span><b>Transparencia de desarrollo</b></div>
    <nav class="nav"><NuxtLink to="/" class="brand"><Icon name="mdi:soccer" class="brand-mark" /><span class="brand-text">LIGA.FUTBOL.APP</span></NuxtLink><NuxtLink to="/" class="back-link"><Icon name="lucide:arrow-left" /> Volver al inicio</NuxtLink></nav>
    <main class="shell">
      <section class="behind-hero">
        <div class="lp-eyebrow"><Icon name="lucide:git-branch" /> Detrás de escena</div>
        <h1>Cómo se construyó esta plataforma</h1>
        <p>Una lectura concreta del trabajo que hay detrás de Liga Libreña: commits, cambios y colaboración, calculados desde el historial real del proyecto.</p>
        <small v-if="stats">Datos al {{ date(stats.generatedAt) }} · snapshot generado durante el build</small>
      </section>

      <section v-if="stats" class="behind-grid">
        <div class="behind-card"><span>Commits</span><b>{{ number(stats.totalCommits) }}</b><small>{{ date(stats.firstCommitDate) }} → {{ date(stats.latestCommitDate) }}</small></div>
        <div class="behind-card"><span>Líneas cambiadas</span><b>+{{ number(stats.totalAdditions) }} / −{{ number(stats.totalDeletions) }}</b><small>{{ elapsed(stats) }} entre el primero y el último</small></div>
        <div class="behind-card"><span>Archivos tocados</span><b>{{ number(stats.uniqueFiles) }}</b><small>en toda la historia alcanzable desde main</small></div>
      </section>

      <section v-if="stats" class="behind-section">
        <div class="lp-section-head"><div class="lp-eyebrow"><Icon name="lucide:users" /> Quién hizo qué</div><h2>La colaboración, visible en la historia</h2><p>La atribución usa la estructura de ramas y merges del repositorio, no el autor nominal de Git.</p></div>
        <div class="attribution-list">
          <div v-for="category in categories" :key="category.key" class="attribution-row"><div class="attribution-head"><b>{{ category.label }}</b><span>{{ category.commits }} commits · +{{ number(category.additions) }} / −{{ number(category.deletions) }}</span></div><div class="bar-track"><div class="bar-fill" :style="{ width: `${(category.commits / maxCommits) * 100}%` }" /></div></div>
        </div>
        <p class="method-note">Los commits de ramas fusionadas con <code>Merge codex/</code> o <code>Merge agent/</code> se atribuyen a esas colaboraciones. Los merges mismos cuentan como marcadores de la historia directa de Claude Code; por eso las tres categorías suman exactamente {{ stats.totalCommits }} commits.</p>
      </section>

      <section v-if="stats" class="behind-section"><div class="lp-section-head"><div class="lp-eyebrow"><Icon name="lucide:layers" /> El proyecto hoy</div><h2>Lo que hay en el repositorio</h2></div><div class="inventory"><div v-for="item in [{ label: 'Migraciones SQL', value: stats.current.migrations }, { label: 'Páginas Vue', value: stats.current.pages }, { label: 'Rutas API', value: stats.current.apiRoutes }, { label: 'Composables', value: stats.current.composables }]" :key="item.label"><b>{{ item.value }}</b><span>{{ item.label }}</span></div></div></section>

      <section v-if="stats" class="behind-section"><div class="lp-section-head"><div class="lp-eyebrow"><Icon name="lucide:scroll-text" /> Changelog real</div><h2>El diario de desarrollo</h2><p>Primero lo más reciente. Sin resumen editorial: son los subjects y fechas de la historia principal.</p></div><ol class="changelog"><li v-for="entry in stats.diary" :key="entry.hash"><time>{{ date(entry.date) }}</time><span>{{ entry.subject }}</span></li></ol></section>
    </main>
  </div>
</template>

<style scoped>
.behind-page { min-height: 100vh; background: var(--paper); }
.back-link { display: inline-flex; align-items: center; gap: 7px; color: var(--lime-soft); font-size: 13px; }
.behind-hero { padding: 74px 0 38px; max-width: 720px; }
.behind-hero h1 { font-size: clamp(42px, 7vw, 76px); line-height: .95; max-width: 700px; }
.behind-hero p { color: var(--muted); font-size: 18px; max-width: 620px; margin: 20px 0 12px; }
.behind-hero small, .behind-card small { color: var(--muted); }
.behind-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.behind-card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 22px; display: grid; gap: 5px; }
.behind-card span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
.behind-card b { font-family: var(--font-display); font-size: 38px; line-height: 1; }
.behind-section { margin-top: 74px; }
.attribution-list { display: grid; gap: 22px; max-width: 760px; }
.attribution-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.attribution-head span { color: var(--muted); font-size: 13px; text-align: right; }
.bar-track { height: 12px; background: var(--line); border-radius: 99px; overflow: hidden; }.bar-fill { height: 100%; background: var(--green-bright); border-radius: inherit; }
.attribution-row:nth-child(2) .bar-fill { background: var(--lime); }.attribution-row:nth-child(3) .bar-fill { background: var(--gold); }
.method-note { color: var(--muted); font-size: 13px; max-width: 760px; margin-top: 24px; } code { color: var(--green); }
.inventory { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }.inventory div { background: var(--paper-tint); padding: 18px; border-radius: var(--radius-md); }.inventory b { display: block; font: 800 34px var(--font-display); }.inventory span { color: var(--muted); font-size: 13px; }
.changelog { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--line); max-width: 900px; }.changelog li { display: grid; grid-template-columns: 145px 1fr; gap: 18px; padding: 13px 0; border-bottom: 1px solid var(--line); }.changelog time { color: var(--muted); font-size: 13px; }.changelog span { font-weight: 600; }
@media (max-width: 640px) { .behind-grid, .inventory { grid-template-columns: 1fr 1fr; }.behind-hero { padding-top: 48px; }.attribution-head { display: block; }.attribution-head span { display: block; text-align: left; margin-top: 3px; }.changelog li { grid-template-columns: 1fr; gap: 2px; } }
</style>
