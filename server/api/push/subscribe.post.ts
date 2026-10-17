import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    league_id: string
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  }>(event)

  if (!body?.league_id || !body?.subscription?.endpoint) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan datos (league_id, subscription)' })
  }

  const config = useRuntimeConfig()
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceRoleKey as string
  )

  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    {
      league_id: body.league_id,
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
