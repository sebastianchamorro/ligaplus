import { createClient } from '@supabase/supabase-js'
import { getWebPush } from '../../utils/webpush'

// Pensado para que lo dispare un cron (Vercel Cron Jobs, pg_cron, etc.) cada pocos
// minutos. Busca partidos que arrancan dentro de la próxima hora y todavía no
// mandaron el aviso, y les pega un push a los suscriptos de esa liga.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceRoleKey as string
  )

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select(
      'id, scheduled_at, tournament_id,' +
        'home_team:teams!matches_home_team_id_fkey(name),' +
        'away_team:teams!matches_away_team_id_fkey(name),' +
        'tournament:tournaments(id, name, league_id)'
    )
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!matches?.length) return { sent: 0, matches: 0 }

  const webpush = getWebPush()
  let sent = 0

  for (const match of matches as any[]) {
    const leagueId = match.tournament?.league_id
    if (!leagueId) continue

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('league_id', leagueId)

    const kickoff = new Date(match.scheduled_at).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    })
    const payload = JSON.stringify({
      title: `${match.home_team.name} vs ${match.away_team.name}`,
      body: `Arranca a las ${kickoff} · ${match.tournament?.name ?? ''}`,
      url: '/'
    })

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err: any) {
        // 404/410 = la suscripción ya no existe del lado del navegador (desinstaló,
        // limpió datos, etc.) - la borramos para no seguir intentando en vano.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    await supabaseAdmin.from('matches').update({ reminder_sent_at: now.toISOString() }).eq('id', match.id)
  }

  return { sent, matches: matches.length }
})
