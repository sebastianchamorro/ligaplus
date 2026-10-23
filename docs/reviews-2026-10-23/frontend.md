# Frontend / UX review

Date: 2026-10-23  
Branch: `codex/review-frontend`

## Scope and verification note

I inspected the actual route components, composables, global styles, and admin action handlers. I also attempted to start the requested server with `npm run dev -- --port 3050` and with an explicit `127.0.0.1` host. Nuxt exits before listening with:

```text
ERROR Unable to find a random port on host "localhost"
```

The connected browser surface also denied access to the local origin. As a result, I could not truthfully capture rendered screenshots or complete live CRUD/upload flows. No database reset or data mutation was performed. There are therefore no screenshot filenames to cite below; this is called out rather than substituting fabricated visual evidence.

## Ranked findings

### 1. Admin match selection is not keyboard/accessibility-friendly and is especially awkward on mobile — confusing

`pages/[league]/admin/torneos/[tournamentId].vue:241-259` renders each match as a clickable `<div>` with `@click`, `cursor: pointer`, and a visual `selected` class, but it is not a button or link and has no keyboard handler, role, or focus state. The operator must click a match before the event/result panels become usable, yet the page does not provide a clear empty-state explanation beyond the small “Elegí un partido” subtitle. On a 390px screen, this long list plus two-column panels will make selecting and then finding the relevant editor unnecessarily difficult.

### 2. Admin success feedback is mostly silent; failed operations are inconsistent — confusing

Several successful actions only refresh local data with no confirmation or status message: creating a tournament (`pages/[league]/admin/index.vue:42-60`), creating a match/referee, saving an event, marking a match finished, and saving a quick result (`pages/[league]/admin/torneos/[tournamentId].vue`). A user can click and be unsure whether anything happened. Failures use `alert()` in some handlers (`pages/[league]/admin/index.vue:23,62,66`; `pages/[league]/admin/equipos/index.vue:32,60,114,129,151`; tournament page lines 125,157,179,192), while validation returns silently in places such as `createTournament()` when the name or teams are missing. This is especially risky for a non-technical administrator entering a result: some invalid actions give no feedback, some failures interrupt with a browser dialog, and there is no persistent inline error state.

### 3. Upload UX does not communicate progress or failure inline, and the “converted to PNG” promise is not user-verifiable — confusing

The league/team crest and player photo upload controls in `pages/[league]/admin/index.vue:107-120` and `pages/[league]/admin/equipos/index.vue:205-220,267-280` disable inputs during upload but provide no visible success state, progress indicator, or inline error. Errors are `alert()` dialogs. The copy says any format “se convierte a PNG solo”, while the follow-up tells the admin to download/edit/re-upload if the result is ugly; that makes a core content workflow feel trial-and-error. A failed or malformed image can leave the old image in place without an obvious explanation.

### 4. League and club pages inherit only the generic site title; no sitemap or robots file is present — minor polish

`nuxt.config.ts:7-17` defines only the global title and description. `pages/ligas/index.vue` adds a directory title, but `pages/[league]/index.vue` and `pages/[league]/clubes/[teamSlug].vue` do not call `useHead`, so a shared link such as `/liga-librena/clubes/mitre` will not get a club-specific title/description or social preview metadata. The repository contains no `robots.txt` or `sitemap.xml`. For a public, history-focused product this weakens discoverability and makes shared club links look generic.

### 5. Sequential standings RPCs are a real latency multiplier on club pages, though not yet an emergency — minor polish

`composables/useLeagueData.ts:164-194` first loads active tournament memberships and then awaits one `standings` RPC per tournament inside a `for` loop. `pages/[league]/clubes/[teamSlug].vue:7-16` awaits league, club, trophies, current standings, players, and staff in sequence. With the stated three simultaneous tournaments, the club page adds three serial RPCs after several serial fetches; on a throttled connection this can create a noticeable blank/late page. At the current scale it is a performance smell, not a blocker: the query volume is bounded and the existing data is small. It becomes worth prioritizing if leagues commonly run many simultaneous tournaments or the RPC is expensive.

### 6. No explicit loading state is rendered while async page data resolves — confusing

The public club page and admin pages use top-level awaited composables (`pages/[league]/clubes/[teamSlug].vue:7-16`, `pages/[league]/admin/index.vue:5-13`, and the teams/admin tournament pages) but do not render skeletons, loading copy, or a page-level pending state. The templates mostly switch between populated content and “no data” states. During slow first load that makes a user see an empty shell or a misleading empty section before data resolves; it is particularly noticeable on the club page because multiple independent datasets arrive at different times.

### 7. Mobile admin layout is likely overloaded rather than task-oriented — confusing

The tournament detail page puts “Partidos por fecha” beside “Crear partido”, then puts event entry beside quick-result entry (`pages/[league]/admin/torneos/[tournamentId].vue:234-390`). The teams page similarly puts player management and staff management in a two-column grid (`pages/[league]/admin/equipos/index.vue:241-325`). `assets/css/main.css:362` defines the two-column grid and the responsive rules collapse layouts at 800px, but the resulting mobile sequence is a long scroll with competing primary actions. For a league administrator on a phone at the field, selecting a match, finding the correct entry mode, and seeing whether the result saved will require excessive scrolling.

### 8. Focus treatment and contrast deserve an accessibility pass — minor polish

`assets/css/main.css:631-633` explicitly removes the focus outline from field inputs and only provides a border-color change. There is no comparable global `:focus-visible` treatment for nav links, buttons, pills, or the clickable match rows. The muted token `#71807a` is used extensively in `assets/css/main.css` and `assets/css/extra.css`; it is visually low-contrast on the paper backgrounds for small supporting text, and the lime-on-dark / lime-on-light combinations should be checked with a contrast tool rather than by eye. Some images have good `alt` text, but the clickable visual match rows have no semantic interactive element, which is the larger accessibility gap.

## Positive observations

- Empty states are generally deliberately written rather than left blank: public league standings, fixture, club history/plantel/palmarés, and admin tournament/event lists all have explanatory copy.
- Image fallbacks are thoughtfully handled with crests/initials, including broken club-logo detection in `pages/[league]/clubes/[teamSlug].vue:20-37`.
- The club page correctly models multiple active tournaments instead of assuming one current tournament.
- Admin forms have associated visible labels in the inspected pages, and image `alt` text is present where an image is rendered.

## Not flagged

The lack of authentication on admin routes is intentionally excluded because it is a known, separately tracked item. No backend/security findings are included.
