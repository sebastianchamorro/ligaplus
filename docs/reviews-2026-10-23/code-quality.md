# Code-quality / technical-debt review

Scope: read/investigate only. I inspected the requested pages, composables, server routes, package/config files, tests, and ran `npm test`. The test suite passed (3 tests, 1 Supabase integration test skipped when the local stack was not reachable through the test's configured URL). `npm run build` reached Nuxt setup but was blocked by an existing `EPERM` lock-file error under the symlinked `node_modules/.cache/nuxt`; it also emitted Node's `MODULE_TYPELESS_PACKAGE_JSON` warning. No application fixes were made.

## 1. Duplicated logo fallback logic

### Finding

The pattern appears in **four** pages, not three:

- `pages/index.vue:44-66`: `brokenLogos`, `onLogoError`, `nextTick`, `querySelectorAll('[data-logo-id]')`, `naturalWidth` check, and `load`/`error` listeners.
- `pages/[league]/index.vue:63-85`: same state/lifecycle/check/listeners, but scoped to `.crest img[data-logo-id]`.
- `pages/ligas/index.vue:11-33`: same as the league page, also scoped to `.crest img[data-logo-id]`.
- `pages/[league]/clubes/[teamSlug].vue:17-31`: a single `brokenLogo` ref and a single `.club-hero-crest img` selector.

The first three are functionally almost identical. The selector difference is not meaningful: the landing page's broader `[data-logo-id]` currently works because only logo images carry that attribute, but it is less defensive if another element later receives the attribute. The club page is deliberately a one-image case, uses a boolean rather than an ID map, and renders initials rather than an icon. The list pages also differ in fallback presentation: `pages/ligas/index.vue:87` uses `mdi:soccer`, while `pages/index.vue:368`, `pages/[league]/index.vue:272,291`, and the club page use initials/other markup.

There is also a small lifecycle issue common to all copies: the listener setup is tied to one `onMounted`/`nextTick` scan. If the async list changes after mount and introduces new image nodes, those nodes are not scanned by this code. In the current pages the initial SSR data normally makes this harmless, but a reusable component can solve it at the element level with `@error` plus a guarded `@load`/`complete` check.

### Recommendation / effort

This is a clean, low-risk extraction **if the abstraction is kept small**: a reusable `LogoWithFallback` component accepting `src`, `alt`, fallback text/icon, and optional class would remove DOM-wide selectors and make the error handling local to each image. A composable alone would share state but would not solve the duplicated DOM scan as cleanly. Preserve the distinct fallback presentation through props rather than forcing one visual treatment.

Example shape:

```vue
<img v-if="src && !broken" :src="src" :alt="alt" @error="broken = true" @load="checkLoaded" />
<span v-else>{{ fallback }}</span>
```

Effort/risk: **quick safe win**, with modest visual regression testing because the four pages intentionally style fallbacks differently. If changing only one thing, extract the three list-page copies first.

## 2. Composable usage inconsistency

### Finding

`composables/useLeagueData.ts` already defines the exact read queries used by the admin team page:

- `useTeamPlayers` selects `id, team_id, full_name, shirt_number, position, photo_url`, filters by `team_id`, and orders by `shirt_number` (`useLeagueData.ts:241-252`).
- `useTeamStaff` selects `id, team_id, full_name, role`, filters by `team_id`, and orders by `full_name` (`useLeagueData.ts:254-265`).

`pages/[league]/admin/equipos/index.vue:66-94` repeats both selects inline. The admin page adds `watch: [selectedTeamId]` and needs `refreshPlayers`/`refreshStaff` after mutations, whereas the composables use fixed keys and parameters. That is a legitimate behavioral difference, but not a reason to duplicate the query projection and ordering. The composables do not currently expose a reactive selected-team input or an explicit refresh contract; this looks like independent implementation drift rather than a deliberate different field set.

Other admin pages also use raw queries, but those are mostly writes or admin-specific reads: tournament match/event management (`pages/[league]/admin/torneos/[tournamentId].vue:18-107`) and tournament creation (`pages/[league]/admin/index.vue:50-65`). They do not directly duplicate an existing typed read as clearly as players/staff do.

### Recommendation / effort

Extract query functions below the composable layer (for example `fetchTeamPlayers(supabase, teamId)` and `fetchTeamStaff(...)`) and have both the public/admin `useAsyncData` wrappers call them. That preserves the admin page's reactive watch and refresh behavior while centralizing the select strings. Alternatively, extend the composables to accept a `MaybeRef` team ID and use a unique admin key; do not blindly reuse the public cache keys.

Effort/risk: **quick-to-medium safe win**. The main thing needing care is cache-key identity and the fact that admin mutations should refresh the selected team's data.

There is another nearby query drift worth noting: `pages/[league]/index.vue:21-53` performs inline standings and fixture queries, while `useTournamentStandings` and `useTournamentMatches` exist in `useLeagueData.ts:267-293`. The page needs a watched selected tournament and filters fixture to `scheduled/postponed`, so direct reuse is not drop-in, but a shared lower-level fetcher or options-based wrapper would still reduce projection drift.

## 3. TypeScript looseness

### Inventory

The requested `: any` / `as any` search found eight occurrences:

- `pages/[league]/admin/equipos/index.vue:32,59,113`: caught errors in upload/save handlers.
- `pages/[league]/admin/index.vue:23`: caught error in tournament creation.
- `composables/useLeagueData.ts:177`: embedded `tournaments` relation cast.
- `composables/useLeagueData.ts:306`: champion relation row cast.
- `server/api/push/send-reminders.post.ts:36`: whole match result cast to `any[]`.
- `server/api/push/send-reminders.post.ts:62`: web-push error catch.
- `composables/usePushSubscription.ts:48`: browser/push error catch.

The catches are the least concerning. In modern TypeScript they can be `unknown`; the code already uses optional property access, so the main improvement is an `isErrorLike` helper or `err instanceof Error`/structured `$fetch` error narrowing. They are not business-model type holes.

The meaningful escape hatches are the Supabase result casts:

1. `useLeagueData.ts:177` assumes the embedded relation is an object with `id/name`, but does not state that contract.
2. `useLeagueData.ts:306-310` casts every champion row to `any` even though only a small relation shape is needed.
3. `send-reminders.post.ts:36-52` casts the entire joined query result to `any[]`, then dereferences `tournament`, `home_team`, and `away_team` as if all are present.

Concrete tighter sketches:

```ts
type TournamentEmbed = { id: string; name: string; league_id: string; status: string }
type TournamentMembershipRow = { tournament_id: string; tournaments: TournamentEmbed }
const tournament = row.tournaments as TournamentEmbed
```

Better still, use generated `Database` types so the query builder infers the row shape, and validate nullable embeds before dereferencing.

```ts
type ReminderMatch = {
  id: string
  scheduled_at: string
  tournament: { id: string; name: string; league_id: string } | null
  home_team: { name: string } | null
  away_team: { name: string } | null
}
for (const match of (matches ?? []) as ReminderMatch[]) {
  if (!match.tournament || !match.home_team || !match.away_team) continue
  // safe use of the joined fields
}
```

For champions, a small mapper input is enough:

```ts
type ChampionQueryRow = {
  id: string
  name: string
  champion: { name: string } | null
}
return (data ?? []).map((row: ChampionQueryRow) => ({ ... }))
```

Effort/risk: replacing catches with `unknown` is a **quick safe win**. Tightening embeds is **medium effort** until generated Supabase types exist; nullable relation behavior should be verified against the actual PostgREST response. The `send-reminders` cast deserves priority because it hides malformed/nullable join data in a cron-like path.

## 4. Test coverage gap

The current tests are appropriately focused: pure calendar formatting (`tests/useCalendarLink.test.ts:11-40`) and a real `standings()` RPC integration test (`tests/standings.integration.test.ts:35-99`). The highest-value additions are:

1. **More standings/RPC cases** (`supabase/migrations/20261016000000_initial_schema.sql`, RPC definition): empty tournament, unfinished matches excluded, wins/draws/losses, null/zero scores, and deterministic tie-break chains. This is the most business-critical logic and can use the same disposable local-Supabase setup with a small fixture helper. Risk is test data cleanup and runtime, not mocking.
2. **Calendar edge cases** (`composables/useCalendarLink.ts`): special characters/newlines, null location/details, invalid or boundary timestamps, and ICS escaping. These are pure and cheap to test.
3. **Small pure extraction tests** if/when query-result mappers are extracted: champion mapping, current-standing position calculation, and perhaps the logo fallback state machine. Do not test Vue DOM implementation before there is a real regression need.
4. **Server route behavior tests** for `upload-logo` and push routes only if the team is willing to introduce a modest server harness/mocking boundary. They contain valuable validation/status behavior, but testing sharp image processing, Supabase, and web-push together would be high mock cost.

Most page UI and admin flows are not high-return unit-test targets today. They are interaction-heavy and coupled to Supabase/browser APIs; meaningful coverage would require component tests or end-to-end tests with seeded data. A small smoke suite for public league page, club page, and one admin mutation could be justified later, but it is not a quick quality win.

Effort/risk: RPC cases are **medium effort/high value**; calendar edge cases are a **quick safe win**; UI/e2e is **real investment**.

## 5. Unused/dead weight

`package.json:16` lists `@nuxtjs/tailwindcss`, but `nuxt.config.ts:22` registers only `@nuxtjs/supabase` and `@nuxt/icon`. The repository uses CSS files (`nuxt.config.ts:5`) and no Tailwind directives/classes were found. No source file imports the package. It is therefore unused in the application as currently written.

Removing it from `package.json` and the lockfile is a **clean, low-risk cleanup** after confirming the lockfile is regenerated by the package manager. It does not alter runtime CSS because the module is not registered. The only caveat is workflow convention: if a future branch expects Tailwind implicitly, that should be an explicit dependency/module change, not a reason to keep dead weight now.

Cross-referencing the other direct dependencies against imports/config found active usage for `@nuxt/icon`, `@nuxtjs/supabase`, `@supabase/supabase-js`, `nuxt`, `sharp`, `vue`/Nuxt auto-imports, `web-push`, the iconify JSON packages, `dotenv`, `happy-dom`/Vitest tooling, and `vue-router` through Nuxt's package surface. I did not find another comparably clear unused direct dependency. `vue-router` is not directly imported, but is a normal Nuxt runtime dependency and should not be removed from this application package casually.

## 6. Build/dev noise and generated Supabase types

The repository has no `types/database.types.ts`; the only reference is the task's description of the `@nuxtjs/supabase` warning. The module is active in `nuxt.config.ts:22-26`, while all Supabase calls currently rely on untyped/inferred client behavior and local hand-written domain types in `useLeagueData.ts:1-93`.

Generating types with the Supabase CLI is worthwhile, but as a bounded follow-up rather than a broad refactor. It would remove the missing-file warning and materially improve the exact places this review found: table insert/update payloads, RPC signatures, and embedded relation result shapes. It would also make it possible to replace the `as any`/`unknown as` casts instead of merely moving them around.

The churn is manageable if the generated file is committed and regenerated only when migrations change. The main caution is that generated types can be verbose and may expose real nullable/embed typing differences, requiring a short reconciliation pass. Given this codebase is already using a local Supabase stack and migrations, I recommend generating it once and wiring the module's `types.database`/equivalent setting, then using it incrementally—not blocking unrelated cleanup on a full typed rewrite.

Effort/risk: **medium, worthwhile**. It is not necessary to fix a production behavior immediately, but it is a high-leverage maintainability improvement and directly reduces the current casts.

The attempted build in this review did not reach the stage where the missing database-types warning could be independently reproduced: Nuxt stopped on `EPERM` opening `node_modules/.cache/nuxt/output-368a648c.lock` because `node_modules` is symlinked/managed outside the writable project path. That limits the runtime-warning claim to repository inspection plus the supplied context.

## 7. Error-handling consistency

### Server routes

The server routes consistently use `createError` for validation and Supabase failures in the obvious paths:

- `server/api/upload-logo.post.ts:10,17,37,50`: 400 for missing multipart data; 500 for image-storage/database failures.
- `server/api/push/subscribe.post.ts:9-10,28` and `unsubscribe.post.ts:5,14`: 400 validation, 500 database failure.
- `server/api/push/send-reminders.post.ts:30`: 500 for the initial match query.

The inconsistency is in what is omitted or leaked:

- `send-reminders.post.ts:40-43` ignores subscription-query errors entirely, then may return success with zero notifications.
- `send-reminders.post.ts:71` ignores the `reminder_sent_at` update error, so a failed update can cause repeated sends without surfacing the failure.
- `send-reminders.post.ts:62-68` intentionally swallows all non-404/410 push errors; that may be operationally reasonable, but there is no logging or returned failure count.
- `server/api/dev-stats.get.ts:7` has no failure path, which is fine for a static import.
- Raw Supabase error messages are returned as `statusMessage` (upload-logo, push routes). This is convenient for the current admin UX, but it leaks backend/provider detail to clients and is inconsistent with a stable public error vocabulary.
- There is no server-side logging before returning errors in these routes. A production log would be especially valuable for upload, push delivery, and failed reminder bookkeeping.

### Admin pages

Admin error handling is materially less consistent than the server routes:

- `pages/[league]/admin/equipos/index.vue:32-36,59-63,113-118` catches some operations and uses `alert`, but formats `$fetch` errors differently from Supabase errors.
- The same page's `removePlayer` and `removeStaff` (`:136-139`, `:157-160`) ignore delete errors completely.
- `pages/[league]/admin/index.vue:23-25` catches creation errors, but `:65-66` only checks the membership insert and does not roll back the already-created tournament if membership insertion fails.
- `pages/[league]/admin/torneos/[tournamentId].vue:125`, `:192`, and nearby mutation handlers use `alert(error.message)` in some places, while `:134-136` and other updates ignore returned errors entirely.

This is a code-quality/maintainability issue rather than a recommendation to redesign UX. A small shared `getErrorMessage(unknown)` helper plus a consistent `if (error) throw/alert` convention would remove repeated unsafe catches and, more importantly, prevent silent failed writes. The tournament-create two-step operation needs real thought: either a server/RPC transaction or an explicit compensating delete, because merely adding an alert does not restore consistency.

Effort/risk:

- Check every ignored Supabase error and add a visible/logged failure path: **quick safe win**.
- Add structured server logging and stable client-facing messages: **medium effort**, worthwhile for operations.
- Make tournament creation atomic: **needs real thought** and should align with the existing data-integrity decisions; it is not a tiny refactor.

## Five highest-value, lowest-risk quick wins

1. Remove the unused `@nuxtjs/tailwindcss` dependency after a lockfile-only verification.
2. Centralize the three repeated list-page logo fallback implementations in a small component, preserving each page's fallback visual via props.
3. Share the players/staff query builders between `useLeagueData.ts` and the admin team page while retaining the admin page's watch/refresh behavior.
4. Replace ignored admin delete/update errors with one consistent visible error path; this prevents silent failed writes without changing architecture.
5. Add pure calendar edge-case tests and a couple of additional standings-RPC cases, reusing the existing test style and local Supabase setup.

## Longer tail / sequencing

Next, generate and commit Supabase database types, then tighten the embedded-query casts and the reminder route's nullable join handling. After that, add server-side logging and decide whether reminder delivery should expose failure counts. Treat tournament creation atomicity and component/e2e coverage as separate, deliberate investments rather than bundling them into routine cleanup.

