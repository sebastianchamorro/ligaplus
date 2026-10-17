<script setup lang="ts">
const { data: leagues } = await usePublicLeagues()

// Puramente visual: si la imagen del logo no carga (404, URL rota), mostramos
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
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app</span>
      <b>Directorio de ligas</b>
    </div>
    <nav class="nav">
      <div class="brand">
        <span class="brand-mark">⚽</span>
        <span class="brand-text">LIGA.FUTBOL.APP</span>
      </div>
    </nav>
    <main class="shell">
      <section class="hero">
        <div class="hero-inner">
          <div>
            <div class="hero-eyebrow">Plataforma multi-liga</div>
            <h1>Ligas en la plataforma.</h1>
            <p>Elegí una liga para ver su tabla de posiciones, el próximo fixture y toda su historia de campeones.</p>
          </div>
        </div>
        <div v-if="leagues?.length" class="stat-strip">
          <div class="stat">
            <b>{{ String(leagues.length).padStart(2, '0') }}</b>
            <span>Ligas publicadas</span>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="page-title">
          <div>
            <h2>Elegí tu liga</h2>
            <p class="muted">Tabla, fixture, clubes e historia, todo en un solo lugar.</p>
          </div>
        </div>
        <div class="cards">
          <NuxtLink v-for="league in leagues" :key="league.id" :to="`/${league.slug}`" class="card">
            <div class="crest">
              <img
                v-if="league.logo_url && !brokenLogos[league.id]"
                :src="league.logo_url"
                :alt="league.name"
                :data-logo-id="league.id"
                @error="onLogoError(league.id)"
              />
              <span v-else class="fallback">⚽</span>
            </div>
            <h3>{{ league.name }}</h3>
            <p>Ver liga</p>
          </NuxtLink>
          <p v-if="!leagues?.length" class="muted">Todavía no hay ligas públicas cargadas.</p>
        </div>
      </section>
    </main>
  </div>
</template>
