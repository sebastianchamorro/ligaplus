# Liga Futbol → Plataforma Multi-Usuario / Multi-Liga

Documento de referencia compartido (para vos, Claude Code, otros agentes y Codex CLI). Si el
plan cambia, actualizá este archivo — no dejes la decisión sólo en un chat.

## Contexto

El proyecto arrancó como un prototipo hecho con ChatGPT: una app Nuxt 3 de 2 páginas
(`pages/index.vue`, `pages/admin.vue`) con los datos de **una sola liga** ("Liga Libreña")
escritos como arrays literales dentro del template. `composables/useLeague.ts` guarda todo en
memoria (`useState`), sin persistencia, sin usuarios, sin roles, sin backend.
`pages/admin.vue` no tiene autenticación. El puntaje se incrementa como efecto secundario de
cargar un evento (`m.homeScore++` dentro de `addEvent`) en vez de calcularse a partir de los
eventos.

Objetivo: convertirlo en un producto real con múltiples ligas, cada una con sus propios
usuarios y roles, datos persistentes y aislados por liga.

## Decisiones de plataforma

- **Hosting:** Vercel (Nitro/Nuxt soporta SSR nativo ahí). Se abandona OpenAI Apps hosting
  (estático) como target principal de deploy.
- **Backend/datos:** Supabase (Postgres + Auth + Storage), vía Row Level Security (RLS) para
  aislar datos por liga.
- **Codex CLI:** usado para tareas acotadas (migraciones SQL, scripts de seed, boilerplate de
  CRUD, tests, CI), siempre en rama propia + PR revisado antes de mergear.

## Modelo de datos

Todas las tablas multi-tenant cuelgan de `league_id` (directo o vía join).

| Tabla | Rol |
|---|---|
| `profiles` | Espejo de `auth.users` |
| `leagues` | Tenant boundary: `slug`, `name`, `is_public`, `owner_profile_id` |
| `league_memberships` | Rol por liga: `(league_id, profile_id, team_id?, role)` — `league_admin` / `team_admin` / `data_loader` / `viewer` |
| `app_super_admins` | Operadores de plataforma (lista chica, no es membership por liga) |
| `tournaments` | `league_id`, fechas, `status` (`upcoming`/`in_progress`/`finished`), `champion_team_id`. Una liga puede tener **varios torneos a la vez** (simultáneos o secuenciales, ej. Torneo Oficial + Copa) |
| `teams` | `league_id`, `status` (`active`/`historic`) |
| `tournament_teams` | Equipos que participan de cada torneo — **cada torneo tiene su propio plantel de equipos**, no se comparten automáticamente entre torneos de la misma liga |
| `players` | Fase 3, no bloquea el MVP |
| `matches` | `tournament_id`, equipos, `status`, `home_score`/`away_score` **derivados** |
| `match_events` | `match_id`, `type`, `team_id`, `player_id`, `created_by` (auditoría) |

Standings calculadas vía view/función SQL `standings(tournament_id)`, no guardadas a mano. Un
trigger recalcula el score en `matches` a partir de `match_events` — reemplaza el bug actual
de incrementar el score como side effect.

## Multi-tenancy y Auth

- El rol nunca es global (salvo `app_super_admins`): se resuelve por liga vía
  `league_memberships`.
- RLS: lectura pública abierta si `leagues.is_public = true`; escritura sólo para
  `league_admin`/`data_loader` de esa liga. `match_events` valida que `team_admin` sólo cargue
  eventos de su propio equipo.
- Lecturas públicas van directo desde cliente/SSR con el SDK de Supabase + anon key (RLS hace
  el control de acceso). Rutas Nitro (`server/api/*`) sólo para lo que requiera `service_role`.

## Cambios en la app Nuxt (Fase 1)

- `pages/index.vue` → `pages/[league]/index.vue`, data-driven desde Supabase. Los datos
  actuales de Liga Libreña se convierten en el seed real, no se tiran.
- `pages/admin.vue` → `pages/[league]/admin/index.vue`, protegida por middleware de rol.
- Nuevo `pages/index.vue` raíz: directorio público de ligas.
- `pages/login.vue` / `pages/signup.vue` nuevas.
- `composables/useLeague.ts` → `useLeagueData.ts` + `useAuth.ts`/`useLeagueRole.ts`.
- Módulo `@nuxtjs/supabase`.
- `dist/*.png` (logos) migran a Supabase Storage en el seed; `dist/*.js` se borran recién
  cuando la página nueva renderice lo mismo correctamente.

## Roadmap por fases

- **Fase 0 — Fundaciones** ✅ en curso: repo git, `.gitignore`, `.env.example`, estructura
  `supabase/migrations|seed`, CI básico. *Pendiente de tu lado:* crear proyecto en Supabase y
  en Vercel, cargar las credenciales.
- **Fase 1 — MVP de una liga real:** migraciones, seed de Liga Libreña, página pública
  data-driven, auth con `league_admin`, CRUD real reemplazando `addEvent`/`addMatch`.
  *Criterio de salida:* Liga Libreña en vivo en Vercel con datos de Supabase, persiste tras
  reiniciar, un admin autenticado carga un gol y la tabla se actualiza sola.
- **Fase 2 — Multi-liga + roles + RLS:** políticas RLS completas, roles `team_admin`/
  `data_loader`, alta de liga nueva, selector de liga, segunda liga real para probar
  aislamiento de datos.
- **Fase 3 — Pulido:** standings cacheadas si hace falta, roster de jugadores + stats, upload
  de logos, navegación de historia más rica.
- **Fase 4 — Escala/ops:** observabilidad, billing sólo si hay demanda real de pago, rate
  limiting en superficies públicas de escritura.

## División de trabajo: Claude Code vs Codex CLI

**Para Codex** (tareas acotadas, bajo riesgo de romper consistencia):
- SQL de migraciones de Fase 1 (una vez aprobado el modelo de arriba).
- Script de seed que parsea los arrays actuales de `pages/index.vue` + `dist/history.js` a
  `INSERT`s.
- Boilerplate de CRUD para tablas simples (`teams`, `tournaments`) una vez establecido el patrón
  de referencia.
- Setup de tests (Vitest) para el cálculo de standings.
- YAML de CI (ya scaffoldeado en `.github/workflows/ci.yml`, ajustar si hace falta).

**Para Claude Code / subagentes** (requiere criterio de seguridad o consistencia cruzada):
- Diseño y revisión de policies RLS (en especial `team_admin` por equipo propio).
- Reestructuración de rutas `pages/[league]/*` y composables que reemplazan `useLeague.ts`.
- Integración de `@nuxtjs/supabase` (SSR vs cliente, middleware de auth).
- Revisión y merge de todo lo generado por Codex antes de aplicarlo contra la base real.

**Mecánica:** cada tarea de Codex corre en su propia rama (`codex/migrations-phase1`,
`codex/seed-script`) y abre PR. Nada se aplica directo a `main` ni contra el proyecto real de
Supabase sin revisión.

## Escudos (logos)

Bucket público `crests` en Supabase Storage. Subida vía `POST /api/upload-logo` (server route,
usa `service_role`, nunca expuesto al cliente): acepta cualquier formato de imagen y la
normaliza a PNG 512x512 con fondo transparente usando `sharp` antes de guardarla. Disponible
desde el admin (`/admin` para el logo de la liga, `/admin/equipos` para el escudo de cada club)
con un link para descargar el escudo actual, editarlo afuera y volver a subirlo.

No hay limpieza con IA (quitar fondo de fotos/capturas de mala calidad) todavía — decisión
explícita de no sumar un servicio externo pago por ahora. Si en algún momento se quiere sumar
(OpenAI images, remove.bg, etc.), es un cambio acotado en `server/api/upload-logo.post.ts`.

**Importante:** los bytes de Storage no viven en Postgres, así que `supabase db reset` los
borra junto con el resto de la base. Después de cada reset hay que volver a correr:

```
node supabase/seed/upload-crests.mjs
```

para restaurar los escudos reales de Liga Libreña (Los Catangos no tiene escudo de origen,
se carga a mano).

## Próximos pasos (tuyos)

1. Crear proyecto en [Supabase](https://supabase.com) y copiar `SUPABASE_URL` /
   `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` a un `.env` local (no se commitea).
2. Crear proyecto en [Vercel](https://vercel.com) e importar este repo
   (`sebastianchamorro/ligaplus`).
3. Avisar cuando estén creados para arrancar la Fase 1 (migraciones + seed + página
   data-driven).
