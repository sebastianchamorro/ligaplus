# Security & data-integrity review

Date: 2026-10-23  
Scope: current worktree, local Supabase configuration/migrations, and attempted local runtime probes.  
Constraint: no migrations, reset, or seeded-data changes were performed.

## Executive summary

The highest-risk issue is not merely that the admin has no login (that is a known Fase 1 constraint). It is that public Nitro routes use the Supabase service-role key and expose privileged mutations without authentication, authorization, rate limiting, or origin checks. In particular, anyone who can reach the app can overwrite arbitrary logo/photo object paths and URL columns, delete any push subscription by endpoint, register subscriptions for any existing league, and invoke the reminder worker.

The requested live Supabase probes could not be completed in this environment: curl to `http://127.0.0.1:54321` returned connection refused, while `lsof` showed a Docker proxy listener and Docker CLI access was denied. Therefore this report distinguishes code/schema-confirmed behavior from runtime behavior that remains unverified.

## Findings (ranked)

### 1. Public service-role routes permit arbitrary cross-tenant asset overwrite — High

`server/api/upload-logo.post.ts` accepts attacker-controlled `target` and `id`, then uses the service-role client to:

* upsert `crests/{target}-{id}.png`, and
* update `teams.logo_url`, `leagues.logo_url`, or `players.photo_url` with `.eq('id', id)`.

There is no ownership, league-membership, existence, or referential consistency check. The route is public and has no auth, origin restriction, or rate limit. A caller can therefore replace any known team/league/player image and its database URL, including across leagues. Arbitrary storage paths are also writable through this route. A nonexistent ID still permits an orphaned storage object because storage upload happens before the table update.

Confirmation: full source inspection of `server/api/upload-logo.post.ts`; the only target validation is membership in `['team', 'league', 'player']`, and the only row predicate is the supplied ID. The route creates its client with `config.supabaseServiceRoleKey`.

Impact in the current local/pre-launch context: high integrity risk if the dev server is reachable by other users; lower immediate public exposure because the project is not stated to be internet-live. It is not a confidentiality escalation by itself, but it enables vandalism and cross-league tampering.

Fix direction: authorize the target against the caller/league and validate the target row before allowing a narrowly scoped upload; add upload limits and cleanup/error handling.

### 2. Public push endpoints expose subscription privacy and mutation — High

`server/api/push/unsubscribe.post.ts` deletes by any caller-supplied endpoint using the service role. Anyone who learns an endpoint can disable another visitor's notifications.

`server/api/push/subscribe.post.ts` accepts arbitrary endpoint/key strings and an arbitrary `league_id`; it does not verify that the league exists before the database insert, nor does it establish ownership of the subscription. For a real league, the caller can register an unlimited number of distinct fake endpoints (subject only to storage/database capacity). The unique `endpoint` upsert also lets a caller move an existing endpoint to a different league by submitting the same endpoint with another `league_id`.

The foreign key means a nonexistent league should be rejected by PostgreSQL, but this was not live-verified because port 54321 was unavailable. Existing league IDs are accepted by code and schema. No request-size, endpoint-format, key-format, or rate validation is present.

Confirmation: full source inspection of both route files and `push_subscriptions` migration. The route performs an admin `upsert` with `onConflict: 'endpoint'`; unsubscribe performs an admin delete with only `.eq('endpoint', body.endpoint)`.

Impact: high integrity/privacy risk for push delivery; subscription endpoints are bearer-like addresses and should not be enumerable or freely reassigned. In local-only use this is mainly an abuse test and shared-environment risk; on a reachable deployment it is materially exploitable.

Fix direction: bind subscriptions to an authorized ownership/session or signed enrollment, validate league existence and payload shape, and rate-limit both operations.

### 3. Reminder worker is publicly callable and has a concurrency race — High

`server/api/push/send-reminders.post.ts` has no authentication, secret, origin restriction, or rate limit. It reads all scheduled matches in the next hour with `reminder_sent_at IS NULL`, sends to every subscription for each league, and only marks the match after all sends complete.

Sequential repeat calls after a successful completion should normally return `{sent: 0, matches: 0}` because of the timestamp guard. However, two overlapping requests can both read the same unmarked match before either updates it, then both send the same notifications. A caller can also repeatedly invoke the route while sends are slow or failing; there is no claim/lock/idempotency mechanism. Failed non-404/410 sends are swallowed and the match is still marked sent, while 404/410 cleanup is best-effort.

Confirmation: full source inspection shows select-then-send-then-update ordering. The requested two-call runtime check could not be executed: both direct curl attempts and the app's local Supabase URL failed with `curl: (7) Failed to connect to 127.0.0.1 port 54321`, so no notification or DB state was changed by this review.

Impact: high operational abuse risk if the route is reachable; repeated/concurrent calls can generate duplicate push traffic and consume push-provider quota. In the current local-only context, exposure is limited to users able to reach the dev server, but the route is unsafe to deploy as a cron endpoint.

Fix direction: protect the cron endpoint and atomically claim due matches before sending, with an idempotency strategy.

### 4. Direct Supabase data access appears unrestricted because RLS is not enabled — High, runtime confirmation blocked

Across all migrations, there is no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no table policy, and no restrictive grants. The schema comments explicitly say RLS is for Fase 2. With Supabase's normal exposed-schema defaults, anon REST access is therefore expected to be able to read/write exposed tables where the `anon` role has its default privileges. This would include sensitive tables such as `push_subscriptions`, and potentially direct mutation of football data, independently of the server routes.

This is a code/schema finding, but the requested practical proof was blocked. Commands attempted included:

```text
curl -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "http://127.0.0.1:54321/rest/v1/teams?select=*&limit=2"
=> curl: (7) Failed to connect to 127.0.0.1 port 54321 after 0 ms: Couldn't connect to server
```

The same read-only probe was prepared for `leagues`, `matches`, `push_subscriptions`, and `players`; none reached PostgREST. I did not perform destructive or synthetic writes when the shared DB endpoint was unavailable.

Impact: potentially the broadest exposure: anonymous clients may be able to read all rows and mutate core league data. Treat as high until the live grant/RLS state is verified; do not infer exact successful operations from this report alone.

Fix direction: enable RLS and write explicit least-privilege policies, or keep all privileged mutations behind authenticated/authorized server operations.

### 5. Upload route has no request-size limit before buffering and image decode — Medium/High

`readMultipartFormData(event)` buffers multipart parts, and the route passes the complete file buffer directly to `sharp`. There is no byte limit, MIME/type validation, pixel-dimension limit, timeout, or concurrency control before processing. A non-image or corrupt image should cause `sharp` to reject and Nitro to return an error; an extension is not trusted because the output is always PNG. That is preferable for content correctness, but it does not provide resource controls.

Sharp/libvips has built-in protections and generally rejects malformed inputs, so this is not proof of a decompression-bomb exploit. It is nevertheless an exposed memory/CPU amplification surface: large compressed images, very large dimensions, and many concurrent requests can consume server resources before the service-role upload.

Confirmation: full route inspection; no size-related option or pre-decode check occurs between multipart parsing and `sharp(filePart.data)`.

Impact: medium in local-only development; high availability concern if publicly reachable.

Fix direction: enforce request and pixel limits before decode, constrain concurrency/time, and reject invalid media explicitly.

### 6. No CORS/origin or rate-limiting controls were found — Medium

No `server/middleware`, rate-limit package/configuration, route-level limiter, or origin/CSRF check was found in the repository. The four requested routes are plain public POST handlers. Direct Supabase REST access is also not origin-restricted by these migrations; browser exposure is governed by Supabase grants/RLS, not by this Nuxt server.

Confirmation commands/source review: `rg` over the repository for `cors`, `origin`, `rate`, `limit`, and middleware-related files; route source contains no such checks. The route handlers accept requests without inspecting headers.

Impact: medium locally, but it amplifies every preceding issue through automation and cross-origin abuse once deployed.

Fix direction: add deployment-appropriate origin/CSRF controls and per-route/IP/user rate limits; protect cron separately.

## Foreign-key and cascade review

Judgment on every `references` clause in the migrations:

| Foreign key | Current action | Assessment |
|---|---|---|
| `profiles.id -> auth.users.id` | cascade | Appropriate: profile lifecycle follows the auth user. |
| `app_super_admins.profile_id -> profiles.id` | cascade | Appropriate dependent membership. |
| `leagues.owner_profile_id -> profiles.id` | default NO ACTION | Reasonable for preserving league ownership history, but deletion of a profile will be blocked rather than transferring/clearing ownership; this is a product-lifecycle decision worth documenting. |
| `teams.league_id -> leagues.id` | cascade | Appropriate if deleting a league means deleting its contained teams. Dangerous only if league deletion is not an intentional hard-delete operation. |
| `league_memberships.league_id -> leagues.id` | cascade | Appropriate dependent rows. |
| `league_memberships.profile_id -> profiles.id` | cascade | Appropriate dependent membership. |
| `league_memberships.team_id -> teams.id` | set null | Appropriate: membership can survive a team deletion without an orphan FK. |
| `tournaments.league_id -> leagues.id` | cascade | Appropriate dependent tournament data. |
| `tournaments.champion_team_id -> teams.id` | default NO ACTION | Potentially accidental: deleting a historic champion team blocks deletion rather than preserving the tournament with a null champion. Since the column is nullable and represents a reference to a team, `ON DELETE SET NULL` looks more coherent. |
| `tournament_teams.tournament_id -> tournaments.id` | cascade | Appropriate join-row cleanup. |
| `tournament_teams.team_id -> teams.id` | cascade | Reasonable for membership rows, though it means deleting a team removes its tournament participation records. It does not delete matches because match team FKs intentionally do not cascade. |
| `players.league_id -> leagues.id` | cascade | Appropriate dependent player data. |
| `players.team_id -> teams.id` | set null | Appropriate for retaining player history after team deletion. |
| `matches.tournament_id -> tournaments.id` | cascade | Likely intentional dependent cleanup, but it deletes match history when a tournament is deleted; the product should require/archive rather than casually delete tournaments if history is permanent. |
| `matches.home_team_id/away_team_id -> teams.id` | NO ACTION | Intentional per task: preserves match history and blocks deleting referenced teams. |
| `match_events.match_id -> matches.id` | cascade | Appropriate event cleanup with match deletion. |
| `match_events.team_id -> teams.id` | NO ACTION | Consistent with preserving match/event history; it blocks team deletion. |
| `match_events.player_id/player_in_id/player_out_id -> players.id` | NO ACTION | Potentially inconsistent with `players.team_id SET NULL`: deleting a player blocks deletion if referenced by an event. For historical events, `SET NULL` is likely the better retention behavior. |
| `match_events.created_by -> profiles.id` | NO ACTION | Potentially accidental: deleting a profile blocks deletion if it authored events. `SET NULL` would preserve event history while dropping attribution. |
| `referees.league_id -> leagues.id` | cascade | Appropriate dependent referee data. |
| `matches.referee_id -> referees.id` | set null | Appropriate historical match retention. |
| `team_staff.team_id -> teams.id` | cascade | Appropriate dependent staff rows. |
| `push_subscriptions.league_id -> leagues.id` | cascade | Appropriate cleanup of subscriptions when a league is deleted. |

The three rows flagged as most likely needing a deliberate decision are `tournaments.champion_team_id`, player references in `match_events`, and `match_events.created_by`. These are not proven defects without the intended deletion policy, but their NO ACTION behavior is inconsistent with the surrounding history-preservation choices.

## Secrets handling

This part is currently fine based on repository inspection:

* `nuxt.config.ts` keeps `supabaseServiceRoleKey`, `vapidPrivateKey`, and `vapidSubject` outside `runtimeConfig.public`.
* Only `supabaseUrl` and `vapidPublicKey` are public runtime values.
* Client composable `composables/usePushSubscription.ts` uses only the public VAPID key; no private key reference was found in client code.
* `.gitignore` ignores `.env` and all `.env.*` except `.env.example`.
* `.env.example` contains placeholders, not the working secret values.
* `git log --all -- .env` and `git log -p --all -- .env` produced no output, so no committed `.env` history was found in the available repository history.

The working `.env` does contain real local service/VAPID values, but it is ignored and was not added to the report.

## Checks that were fine / not findings

* The intentional non-cascading `matches.home_team_id` and `away_team_id` FKs are present and preserve match rows by blocking team deletion.
* Upload output is normalized to PNG and the supplied filename/extension is not used as output content type.
* The `push_subscriptions.league_id` FK prevents insertion for a nonexistent league at the database layer (not live-tested here because PostgREST was unreachable).
* The reminder route removes subscriptions after Web Push 404/410 responses and has a sequential `reminder_sent_at` guard; the remaining issue is public access and the concurrent read-before-write race.
* Secret runtime-config separation and gitignore/history checks passed as described above.

## Verification limitation

No application or database writes were made by this review. The local stack could not be probed because the shell received connection-refused errors from `127.0.0.1:54321`; Docker CLI access also returned `permission denied while trying to connect to the Docker API`. A follow-up run with access to the existing Supabase service should execute anon GET/POST/PATCH/DELETE probes and the requested two immediate reminder calls, then replace the runtime-verification caveats above with exact HTTP responses and DB counts.
