import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ endpoint: string }>(event)
  if (!body?.endpoint) throw createError({ statusCode: 400, statusMessage: 'Falta endpoint' })

  const config = useRuntimeConfig()
  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceRoleKey as string
  )

  const { error } = await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
