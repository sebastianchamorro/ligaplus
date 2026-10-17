<script setup lang="ts">
// La landing muestra a Liga Libreña como caso real y en vivo: todos los números
// de esta página (clubes, torneos simultáneos, títulos, tabla) salen de la base
// real, no son copy inventado. Si la demo deja de tener sentido (cambia el
// fixture, termina un torneo, etc.) esta página se actualiza sola.
const { data: league } = await useLeagueBySlug('liga-librena')
// UUID inválido-pero-bien-formado como fallback: si por algún motivo la liga de
// ejemplo no está cargada, los filtros `eq.league_id` siguen siendo válidos para
// Postgrest (devuelven cero filas) en vez de romper por un string vacío.
const leagueId = league.value?.id ?? '00000000-0000-0000-0000-000000000000'

const { data: teams } = await useLeagueTeams(leagueId)
const { data: tournaments } = await useAllTournaments(leagueId)
const { data: champions } = await useLeagueChampions(leagueId)

const activeTeams = computed(() => (teams.value ?? []).filter((t) => t.status === 'active'))
const inProgressTournaments = computed(() => (tournaments.value ?? []).filter((t) => t.status === 'in_progress'))
const finishedWithChampion = computed(
  () => (tournaments.value ?? []).filter((t) => t.status === 'finished' && t.champion_team_id)
)
const titlesCount = computed(() => finishedWithChampion.value.length || (champions.value?.length ?? 0))
const earliestYear = computed(() => {
  // Leemos el año directo del string "YYYY-MM-DD" en vez de pasar por `new Date(...)`:
  // un `Date` parseado en UTC medianoche puede mostrar el año anterior en husos horarios
  // negativos (ej. "1950-01-01" → 1949), lo cual sería un dato incorrecto en la página.
  const years = finishedWithChampion.value
    .map((t) => (t.start_date ? Number(t.start_date.slice(0, 4)) : null))
    .filter((y): y is number => y !== null && !Number.isNaN(y))
  return years.length ? Math.min(...years) : null
})

const featuredTournamentId =
  inProgressTournaments.value.find((t) => t.name === 'Torneo Oficial 2026')?.id ??
  inProgressTournaments.value[0]?.id ??
  ''
const { data: standings } = await useTournamentStandings(featuredTournamentId)
const topStandings = computed(() => (standings.value ?? []).slice(0, 5))
const featuredTournament = computed(() => inProgressTournaments.value.find((t) => t.id === featuredTournamentId))

const showcaseTeams = computed(() => activeTeams.value.filter((t) => t.logo_url).slice(0, 7))

// Mismo manejo de logos rotos que el resto del sitio: si la imagen no carga,
// mostramos un fallback en vez del ícono roto del navegador.
const brokenLogos = reactive<Record<string, boolean>>({})
function onLogoError(id: string) {
  brokenLogos[id] = true
}

onMounted(() => {
  nextTick(() => {
    document.querySelectorAll('[data-logo-id]').forEach((el) => {
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
      <b class="lp-topbar-tag">Plataforma para ligas de fútbol amateur</b>
    </div>
    <nav class="nav">
      <NuxtLink to="/" class="brand">
        <Icon name="mdi:soccer" class="brand-mark" />
        <span class="brand-text">LIGA.FUTBOL.APP</span>
      </NuxtLink>
      <div class="navlinks-wrap">
        <div class="navlinks">
          <a href="#funciones">Funciones</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#liga-librena">Liga Libreña</a>
          <NuxtLink to="/ligas">Ver ligas</NuxtLink>
        </div>
      </div>
      <div class="lp-nav-ctas">
        <a class="btn secondary" href="/liga-librena"><span>Ver ejemplo en vivo</span></a>
        <a class="btn" href="#contacto"><span>Hablemos</span></a>
      </div>
    </nav>

    <main class="shell">
      <section class="hero lp-hero">
        <div class="hero-inner">
          <div>
            <div class="hero-eyebrow">Para ligas que hoy funcionan a pura buena voluntad</div>
            <h1>La tabla de tu liga no debería vivir en una captura de WhatsApp.</h1>
            <p>
              Cargás el resultado una vez. La tabla de posiciones, el fixture y la página de cada
              club se actualizan solos — nadie tiene que volver a armar la tabla en Canva un
              domingo a la noche.
            </p>
            <div class="lp-hero-ctas">
              <a class="btn" href="/liga-librena">
                <Icon name="lucide:external-link" /> Ver Liga Libreña en vivo
              </a>
              <a class="btn secondary" href="#como-funciona">
                <Icon name="lucide:play" /> Cómo funciona
              </a>
            </div>
          </div>
        </div>
        <div class="stat-strip">
          <div class="stat">
            <b>{{ String(activeTeams.length).padStart(2, '0') }}</b>
            <span>Clubes jugando hoy</span>
          </div>
          <div class="stat">
            <b>{{ String(inProgressTournaments.length).padStart(2, '0') }}</b>
            <span>Torneos simultáneos</span>
          </div>
          <div class="stat">
            <b>{{ titlesCount }}</b>
            <span>Títulos oficiales{{ earliestYear ? ` desde ${earliestYear}` : '' }}</span>
          </div>
        </div>
      </section>

      <!-- ---------------- Antes / Después ---------------- -->
      <section class="lp-section">
        <div class="lp-section-head center">
          <div class="lp-eyebrow"><Icon name="lucide:history" /> El problema real</div>
          <h2>Así se arma hoy la tabla en la mayoría de las ligas</h2>
          <p>
            Liga Libreña hacía exactamente esto hasta hace poco. No es una exageración de
            marketing: es literalmente cómo arrancó este proyecto.
          </p>
        </div>

        <div class="lp-compare">
          <div class="lp-compare-card before">
            <span class="lp-compare-label"><Icon name="lucide:message-circle" /> Antes</span>
            <div class="lp-bubble">
              <span class="icon"><Icon name="lucide:message-circle" /></span>
              <em>"Alguien me pasa el resultado por WhatsApp y yo lo sumo a mano en Excel."</em>
            </div>
            <div class="lp-bubble">
              <span class="icon"><Icon name="lucide:image" /></span>
              <em>"Después rearmo la tabla en Canva para publicarla en Instagram."</em>
            </div>
            <div class="lp-bubble">
              <span class="icon"><Icon name="lucide:alert-triangle" /></span>
              <em>"Si me equivoco sumando puntos, nadie se entera hasta el reclamo del club."</em>
            </div>
            <p class="lp-footnote">
              Así funcionaba Liga Libreña, con décadas de historia real perdidas en spreadsheets
              sueltos — hasta que migró acá.
            </p>
          </div>

          <div class="lp-compare-card after">
            <span class="lp-compare-label"><Icon name="lucide:sparkles" /> Ahora</span>
            <div class="lp-mini-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Club</th>
                    <th>PJ</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in topStandings" :key="row.team_id">
                    <td>{{ i + 1 }}</td>
                    <td>{{ row.team_name }}</td>
                    <td>{{ row.played }}</td>
                    <td>{{ row.points }}</td>
                  </tr>
                  <tr v-if="!topStandings.length">
                    <td colspan="4" class="muted">Todavía no hay resultados cargados.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <span class="badge live"><span class="dot" /> Calculada sola, en vivo</span>
            <p class="lp-footnote">
              Cargás el resultado una sola vez — evento a evento o sólo el marcador final — y la
              tabla, el fixture y la página de cada club se actualizan solos.
            </p>
          </div>
        </div>
      </section>

      <!-- ---------------- Funciones ---------------- -->
      <section id="funciones" class="lp-section">
        <div class="lp-section-head">
          <div class="lp-eyebrow"><Icon name="lucide:check-circle-2" /> Lo que ya funciona hoy</div>
          <h2>Todo lo que hoy hacés a mano, en un solo lugar</h2>
          <p>Nada de esto es una promesa a futuro: es lo que ya corre, hoy, para Liga Libreña.</p>
        </div>

        <div class="lp-feature-grid">
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="mdi:domain" /></div>
            <h3>Una plataforma, muchas ligas</h3>
            <p>Cada liga tiene su propia página pública, sus propios clubes y su propio panel — la tuya no se mezcla con ninguna otra.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:layers" /></div>
            <h3>Varios torneos, al mismo tiempo</h3>
            <p>Liga Libreña corre a la vez su Torneo Oficial, el Fútbol Infantil y la Quinta División — cada uno con su propia tabla y sus propios equipos.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:table" /></div>
            <h3>La tabla se calcula sola</h3>
            <p>Puntos, PJ, G/E/P, goles a favor y en contra, diferencia de gol — todo sale de los resultados cargados, no de alguien tipeando "+3" a mano.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:list-checks" /></div>
            <h3>Partido a partido o sólo el resultado</h3>
            <p>Cargá el partido minuto a minuto (goles, tarjetas, cambios) y las estadísticas salen gratis, o cargá sólo el marcador cuando no hay tiempo para más.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:calendar-plus" /></div>
            <h3>El fixture se arma fecha a fecha</h3>
            <p>Creás las fechas que realmente tenés, con su fecha real — no un calendario de temporada completa armado de antemano.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="mdi:shield-outline" /></div>
            <h3>Cada club, su propia página</h3>
            <p>Escudo (cualquier formato, se normaliza solo), historia del club, posición en los torneos que juega hoy y su palmarés completo.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:users" /></div>
            <h3>Plantel y cuerpo técnico</h3>
            <p>Jugadores con foto (cualquier formato, se recorta solo), dorsal y posición, más el cuerpo técnico. Todo opcional: un club chico no necesita completarlo todo.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:calendar-check" /></div>
            <h3>Un click y queda en tu calendario</h3>
            <p>"Agregar al calendario" manda el partido a Google Calendar o descarga un .ics universal para Apple y Outlook.</p>
          </div>
          <div class="lp-feature-card">
            <div class="lp-feature-icon"><Icon name="lucide:bell-ring" /></div>
            <h3>Avisale al hincha, gratis</h3>
            <p>Notificaciones del navegador para avisar que el partido está por arrancar — sin instalar una app, sin pedir teléfono ni mail, sin pagarle a nadie por el aviso.</p>
          </div>
        </div>
      </section>

      <!-- ---------------- Cómo funciona ---------------- -->
      <section id="como-funciona" class="lp-section">
        <div class="lp-section-head center">
          <div class="lp-eyebrow"><Icon name="lucide:route" /> Cómo funciona</div>
          <h2>De la cancha a la tabla, en cuatro pasos</h2>
        </div>

        <div class="lp-steps">
          <div class="lp-step">
            <span class="lp-step-num">1</span>
            <h3>Cargás liga y clubes</h3>
            <p>Nombre, escudo en cualquier formato, clubes activos e históricos.</p>
          </div>
          <div class="lp-step">
            <span class="lp-step-num">2</span>
            <h3>Creás el torneo</h3>
            <p>Torneo oficial, una copa, una categoría juvenil — los que hagan falta, al mismo tiempo.</p>
          </div>
          <div class="lp-step">
            <span class="lp-step-num">3</span>
            <h3>Armás la fecha y cargás el resultado</h3>
            <p>Evento a evento o sólo el marcador final, según el tiempo que tengas esa noche.</p>
          </div>
          <div class="lp-step">
            <span class="lp-step-num">4</span>
            <h3>Todo se actualiza solo</h3>
            <p>Tabla, fixture y la página de cada club. Nada para rediseñar en Canva.</p>
          </div>
        </div>
      </section>

      <!-- ---------------- Liga Libreña, caso real ---------------- -->
      <section id="liga-librena" class="lp-section">
        <div class="lp-showcase">
          <div class="lp-showcase-top">
            <div class="lp-showcase-heading">
              <div v-if="league?.logo_url" class="lp-showcase-crest">
                <img :src="league.logo_url" :alt="league.name" data-logo-id="league-crest" />
              </div>
              <div>
                <div class="hero-eyebrow">Caso real, en vivo — no es una maqueta</div>
                <h2>{{ league?.name ?? 'Liga Libreña' }} ya dejó el Excel y el Canva atrás</h2>
                <p class="lp-showcase-sub">
                  General Madariaga, Paso de los Libres. La liga que arrancó este proyecto corre,
                  hoy, sobre esta misma plataforma — con historia oficial real desde {{ earliestYear ?? 1950 }}.
                </p>
              </div>
            </div>
          </div>

          <div class="stat-strip">
            <div class="stat">
              <b>{{ String(activeTeams.length).padStart(2, '0') }}</b>
              <span>Clubes activos</span>
            </div>
            <div class="stat">
              <b>{{ String(inProgressTournaments.length).padStart(2, '0') }}</b>
              <span>Torneos en juego ahora</span>
            </div>
            <div class="stat">
              <b>{{ titlesCount }}</b>
              <span>Títulos registrados</span>
            </div>
          </div>

          <div class="lp-showcase-body">
            <div class="lp-showcase-tournaments">
              <div v-for="t in inProgressTournaments" :key="t.id" class="lp-showcase-tournament">
                <span>{{ t.name }}</span>
                <span class="badge live"><span class="dot" /> En juego</span>
              </div>
              <p v-if="!inProgressTournaments.length" class="muted">Sin torneos en juego por ahora.</p>
            </div>

            <div class="lp-showcase-panel panel">
              <div class="panel-head">
                <h2>{{ featuredTournament?.name ?? 'Tabla' }}</h2>
                <span class="muted">Top {{ topStandings.length }}</span>
              </div>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Club</th>
                      <th>PJ</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in topStandings" :key="row.team_id" :class="{ champ: i === 0 }">
                      <td>
                        <span class="pos" :class="{ gold: i === 0, silver: i === 1, bronze: i === 2 }">{{ i + 1 }}</span>
                      </td>
                      <td><b>{{ row.team_name }}</b></td>
                      <td>{{ row.played }}</td>
                      <td>{{ row.points }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!topStandings.length" class="empty">Todavía no hay partidos jugados en este torneo.</p>
            </div>
          </div>

          <div class="lp-showcase-crests">
            <div v-for="team in showcaseTeams" :key="team.id" class="crest">
              <img
                v-if="!brokenLogos[team.id]"
                :src="team.logo_url!"
                :alt="team.name"
                :data-logo-id="team.id"
                @error="onLogoError(team.id)"
              />
              <Icon v-else name="mdi:soccer" class="fallback" />
            </div>
          </div>

          <div class="lp-showcase-cta">
            <a class="btn" href="/liga-librena">
              <Icon name="lucide:external-link" /> Ver la liga completa en vivo
            </a>
            <span class="muted">Datos reales, no una demo armada para esta página.</span>
          </div>
        </div>
      </section>

      <!-- ---------------- CTA final ---------------- -->
      <section id="contacto" class="lp-section">
        <div class="lp-final">
          <h2>¿Tu liga también vive en un grupo de WhatsApp?</h2>
          <p>
            Hablemos de cómo migrarla. Mientras estamos en beta, sumar tu liga a la plataforma
            no tiene costo.
          </p>
          <div class="lp-final-ctas">
            <a class="btn" href="mailto:hola@liga.futbol.app">
              <Icon name="lucide:mail" /> Escribinos
            </a>
            <NuxtLink class="btn secondary" to="/ligas">
              <Icon name="lucide:list" /> Ver ligas en la plataforma
            </NuxtLink>
          </div>
        </div>
      </section>

      <footer class="lp-footer">
        <div class="brand">
          <Icon name="mdi:soccer" class="brand-mark" />
          <span class="brand-text">LIGA.FUTBOL.APP</span>
        </div>
        <span>Hecho para ligas amateur que todavía arman la tabla a mano.</span>
        <NuxtLink to="/ligas">Ver todas las ligas →</NuxtLink>
      </footer>
    </main>
  </div>
</template>
