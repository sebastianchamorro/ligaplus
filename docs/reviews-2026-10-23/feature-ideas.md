# Feature-opportunity brainstorm

Scope reviewed: the SQL migrations, `useLeagueData.ts`, the public league and club pages, and the admin tournament/team pages. The recommendations below deliberately build on the current multi-league/multi-tournament model and on the distinction between event-based and manual-score matches.

Priority is an impact/effort judgment for an amateur league: P0 is the best near-term product value, P1 is valuable once the core match experience is stronger, and P2 is useful but depends on better data quality or a larger operational workflow.

## P0 — Complete match records and publish a match-detail page

### What it is

Give every match a public detail route, for example `/{league}/partidos/{matchId}`, with the final score, date/venue, tournament and matchday, referee, and a chronological event timeline. Link to it from the fixture and from completed matches. For event-logged games, show goals, own goals, cards and substitutions; for manual results, clearly label the record as “resultado final cargado manualmente” and show only what is actually known.

### What already exists

`matches` already has the identity needed for a canonical page: tournament, both teams, date, matchday, venue, status, scores, `score_source`, and `referee_id`. `match_events` already stores minute, extra minute, event type, team and optional player references. The admin page already selects a match and lists its events.

### What is missing

There is no public match route or public event query. The public league page only renders scheduled/postponed matches and does not expose finished matches as navigable records. The admin event list selects only `id, minute, type, team_id`, so even the internal timeline does not resolve player names. `venue` exists in SQL but is not collected by the “Crear partido” form; referee data is captured but not publicly queried.

### Rough scope

New public route plus a match composable/query joining the two teams, tournament and referee, and a public event timeline query. Add links from the complete fixture and/or table history. No new table is required. A small presentation decision is needed for manual-score matches so the UI does not suggest event completeness.

### Why P0

This closes the most visible gap between “the league has an official record” and “fans can follow what happened.” It also creates the natural destination for every later statistic. Risk is low because it is read-only and uses existing entities.

## P0 — Complete tournament fixture, grouped by matchday

### What it is

Replace the public “Próximos partidos” list with a full-season fixture view: every matchday, finished scores, scheduled games, postponed games, and unscheduled/unknown-date games. Keep a compact “next matches” view as the default if desired, with a “Ver fixture completo” control.

### What already exists

`matches.matchday` and `matches.status` already support grouping and lifecycle display. The admin page groups every loaded match with `matchesByMatchday`. `useTournamentMatches(tournamentId, status?)` can already fetch all matches when no status is supplied.

### What is missing

The public page queries `.in('status', ['scheduled', 'postponed'])`, so finished matches disappear entirely. It has no matchday grouping beyond the label on each upcoming row, and no link to a match record. The public composable type also has no venue/tournament/referee name fields.

### Rough scope

Add a complete-fixture query/route or a mode on the league page, order by matchday and scheduled time, group in computed state, and render status-specific score rows. Add a “full fixture” entry point near the tournament switcher. No schema migration is needed; consider adding an explicit “bye” concept only if the competition format needs it.

### Why P0

This is high fan value and very small implementation risk. The current page is useful only for the future, while a league audience also needs to check what already happened and whether a postponed fixture was eventually played.

## P0 — Player-aware event logging, then tournament leaderboards

### What it is

Add player selectors to event logging for goals, own goals, cards and substitutions, then expose tournament leaderboards for goals, yellow cards and red cards. A public tournament stats section or route can show top scorers and discipline totals, with team and player links where available.

### What already exists

`players` belongs to a team and has name, shirt number, position and photo. `match_events` already has `player_id`, `player_in_id` and `player_out_id`; its event enum already covers goals, own goals, cards and substitutions. The admin team page already manages roster data and the public club page already displays it.

### What is missing

The tournament event form only lets the admin choose minute, team and event type. `saveEvent()` inserts no player field, and the event query does not select one. Therefore the existing schema is only halfway to top scorers: new events have no player attribution, and old events may be null. The current manual-score mode cannot produce player statistics and should be excluded from leaderboard totals rather than guessed.

### Rough scope

Add team-filtered player selectors (goal/card player; in/out selectors for substitutions), validate that the player belongs to the selected team, and select player names in the event timeline. Leaderboards can be pure aggregation over `match_events` joined to `matches` and `players`, filtered by tournament and event type; a SQL view/function is preferable once the query is reused. Decide whether own goals count for the credited team or are shown separately. Backfill is optional and should not invent player identities.

### Why P0

This is a strong differentiator with unusually high leverage: one modest admin improvement unlocks match timelines, top scorers and discipline tables. It also fits amateur behavior because a league can start with team-only/manual entry and add detail when someone has the time.

## P1 — Historical table after each matchday

### What it is

Let fans select “Fecha 1 / Fecha 2 / …” and see the standings exactly as they were after that matchday, with movement versus the previous date. Optionally show a compact position chart for the season.

### What already exists

The standings function already computes live standings from finished matches and returns all core columns: played, wins, draws, losses, goals for/against, difference and points. Matches have a `matchday`, and tournaments are distinct containers.

### What is missing

There is no snapshot table, historical query, or public matchday selector. Current standings always include every finished match, regardless of matchday. Because results can be edited or corrected, a literal immutable snapshot would need an operational policy; a reproducible “as of matchday” calculation is safer for Phase 1.

### Rough scope

Add a parameterized SQL function/view that limits `matches` to `status = 'finished'` and `matchday <= selected`, reusing the same points/tiebreak rules as `standings()`. Add a matchday list derived from the tournament's matches and a selector on the public tournament view. A future `standings_snapshots` table is only needed if the league wants an audit trail that preserves tables before corrections.

### Why P1

High storytelling value for a league with history and low UI risk, but it is less urgent than making the fixture and match record complete. The main risk is duplicated standings logic drifting from `standings()`; centralizing the calculation matters.

## P1 — Bulk-create a matchday

### What it is

Let the administrator choose a matchday, enter or generate all pairings, and assign dates/times/referees in one screen. For a round-robin, offer a proposed pairing set with editable rows; do not silently assume a format for youth/reserve or irregular competitions.

### What already exists

The tournament admin already knows `tournamentTeams`, creates individual `matches`, assigns `matchday`, date/time and optional referee, and groups matches by matchday. The database accepts multiple matches with the same tournament and matchday.

### What is missing

The UI has one home selector, one away selector and one insert per submission. There is no duplicate-pairing validation, “all teams included” check, bulk insert, or scheduling grid. The schema has no explicit round-robin/competition-format metadata, so automatic pairing cannot be universally correct.

### Rough scope

Add a bulk form that creates a draft array in the browser, validates duplicate teams and duplicate pairings within the chosen matchday, then inserts rows in one Supabase call. If automatic generation is offered, make it an optional helper and retain editable rows. Add a database-level uniqueness strategy only after deciding whether rematches and postponed rescheduling are allowed.

### Why P1

This directly reduces the administrator's weekly workload and prevents copy/paste errors. It is more operationally valuable than a sophisticated stats feature, but it has moderate product risk because tournament formats vary.

## P1 — Public referee and venue information

### What it is

Show assigned referee and venue on public fixture rows and match pages, with clear “a confirmar” states. Include both in the calendar payload.

### What already exists

`referees` is a league-scoped table, `matches.referee_id` is nullable, and the admin form can add/select a referee. `matches.venue` already exists. The admin list already resolves and displays referee names.

### What is missing

The public fixture select does not request `referee_id` at all and has no referee join. The public UI hardcodes `Estadio Agustín Faraldo` in Google Calendar and .ics links instead of using `matches.venue`; the admin “Crear partido” form does not collect venue.

### Rough scope

Collect venue in the admin create/edit flow, select the referee name through a join or a second lookup, render both in public match cards/detail, and use the stored venue in calendar links. No schema change is necessary. An edit path is important because assignments often change after a fixture is created.

### Why P1

Very low implementation effort and meaningful practical value for amateur players and referees. It should be bundled with the match-detail/full-fixture work rather than treated as a large standalone project.

## P2 — Team comparison and head-to-head

### What it is

On a club page or a dedicated comparison route, let a fan compare two tournament participants: current rank/form, record, goals for/against and previous meetings, with links to the relevant match records.

### What already exists

The standings function provides team totals, and `matches` retains both team IDs, scores, status and matchday. Club pages already know a team and its current tournament standings.

### What is missing

There is no match-history query, form calculation, comparison UI, or public match-detail destination. Tie-break rules and whether to include only finished matches need to be explicit. Comparing clubs across tournaments would be misleading because tournament participation is separate.

### Rough scope

Add a tournament-scoped query for the two selected teams' finished matches, aggregate recent form and head-to-head rows, and render a small comparison component linked from team/tournament pages. No new tables are required. Keep it scoped to a selected tournament and treat manual scores as valid for team-level stats.

### Why P2

Good fan engagement, but it depends on the full fixture and match-detail foundations and is less important to the administrator's weekly workflow.

## P2 — Favorite-team notifications, with a client-first path

### What it is

Let a fan choose one or more favorite teams and receive browser reminders only for their matches, while retaining the current league-wide subscription option.

### What already exists

Web Push is already implemented with a league-scoped `push_subscriptions` row and a reminder marker on `matches`. The public page has subscribe/unsubscribe controls and no account is currently required.

### What is missing

There is no team preference in `push_subscriptions`; every subscription is implicitly for the whole league. There is also no identity or login to synchronize preferences across devices. The server-side notification sender would need to filter subscriptions by team preference and handle users who follow multiple teams.

### Rough scope

For a low-risk first version, store favorite team IDs in browser storage and send them with the subscription registration, but this still requires a schema/API change if the server must filter push jobs. A durable cross-device version needs authentication or a separate opaque preference token. Add unsubscribe/permission edge-case handling and preserve the league-wide default.

### Why P2

It is a compelling fan feature, but it adds permission and delivery complexity and is not essential until the product has a complete, reliable fixture. Explicitly avoid making login a prerequisite for the client-only experience; make the cross-device version an auth-dependent upgrade.

## Recommended sequence

1. Full fixture + public match-detail page, including referee/venue display.
2. Player-aware event logging + top scorers/cards, with manual-score limitations visible.
3. Historical standings by matchday.

That sequence first makes every match discoverable and trustworthy, then turns the existing roster/event schema into useful stats, and finally adds season narrative without introducing a second source of truth for standings.

## Investigation note

Source inspection was completed in the worktree. I also attempted the requested local run on port 3060 and read-only calls to the local Supabase API. In this execution environment, Node cannot bind a local listener (`EPERM`) and `127.0.0.1:54321` is unreachable, so seeded-row observations and click-through behavior could not be independently verified here. No database reset or write was performed.
