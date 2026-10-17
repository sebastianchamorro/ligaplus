<script setup lang="ts">
const { data: leagues } = await usePublicLeagues()
</script>

<template>
  <div>
    <div class="topbar">
      <span>liga.futbol.app</span>
      <b>Directorio de ligas</b>
    </div>
    <nav class="nav">
      <div class="brand">LIGA.FUTBOL.APP</div>
    </nav>
    <main class="shell">
      <section class="page-title">
        <div>
          <h1>Ligas en la plataforma.</h1>
          <p class="muted">Elegí una liga para ver su tabla, fixture e historia.</p>
        </div>
      </section>
      <section class="section">
        <div class="cards">
          <NuxtLink v-for="league in leagues" :key="league.id" :to="`/${league.slug}`" class="card">
            <div style="height: 82px; display: flex; align-items: center; justify-content: center">
              <img v-if="league.logo_url" :src="league.logo_url" :alt="league.name" style="height: 82px; max-width: 100%; object-fit: contain" />
              <span v-else style="font: 700 32px 'Barlow Condensed'; color: var(--muted)">⚽</span>
            </div>
            <h3 style="font-size: 22px; margin: 10px 0 5px">{{ league.name }}</h3>
          </NuxtLink>
          <p v-if="!leagues?.length" class="muted">Todavía no hay ligas públicas cargadas.</p>
        </div>
      </section>
    </main>
  </div>
</template>
