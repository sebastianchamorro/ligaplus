import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

// Recibe cualquier formato de imagen (jpg, captura, foto, etc.) y la normaliza a un PNG
// cuadrado con fondo transparente antes de subirla - así no importa qué suban, el
// escudo que queda guardado siempre es un PNG consistente.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Sin archivo' })

  const filePart = parts.find((p) => p.name === 'file' && p.data?.length)
  const target = parts.find((p) => p.name === 'target')?.data?.toString('utf-8')
  const id = parts.find((p) => p.name === 'id')?.data?.toString('utf-8')

  if (!filePart || !target || !id || !['team', 'league'].includes(target)) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan datos (file, target, id)' })
  }

  const png = await sharp(filePart.data)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const supabaseAdmin = createClient(
    config.public.supabaseUrl as string,
    config.supabaseServiceRoleKey as string
  )

  const path = `${target}-${id}.png`
  const { error: uploadError } = await supabaseAdmin.storage
    .from('crests')
    .upload(path, png, { contentType: 'image/png', upsert: true })
  if (uploadError) throw createError({ statusCode: 500, statusMessage: uploadError.message })

  const { data: publicUrlData } = supabaseAdmin.storage.from('crests').getPublicUrl(path)
  // Cache-busting: el nombre de archivo es siempre el mismo por equipo/liga (upsert), así
  // que sin esto el navegador podría seguir mostrando el escudo viejo cacheado.
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

  const table = target === 'team' ? 'teams' : 'leagues'
  const { error: updateError } = await supabaseAdmin
    .from(table)
    .update({ logo_url: logoUrl })
    .eq('id', id)
  if (updateError) throw createError({ statusCode: 500, statusMessage: updateError.message })

  return { logo_url: logoUrl }
})
