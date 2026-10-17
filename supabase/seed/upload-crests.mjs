// Sube a Supabase Storage los escudos que ya estaban en dist/ (del prototipo viejo) y
// actualiza teams.logo_url / leagues.logo_url con la URL real.
//
// No es parte de seed.sql porque Storage guarda los bytes fuera de Postgres - un `db reset`
// recrea las tablas pero no los objetos subidos, así que después de cada reset hay que
// volver a correr esto:
//
//   node supabase/seed/upload-crests.mjs
//
// Requiere el stack local levantado (`supabase start`) y las env vars de .env cargadas.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

const root = path.resolve(fileURLToPath(import.meta.url), '../../..')
dotenv.config({ path: path.join(root, '.env') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TEAM_FILES = {
  Mitre: 'dist/liga mitre.png',
  'Ferro/Pumitas': 'dist/liga ferro.png',
  Rivera: 'dist/liga rivera.png',
  Madariaga: 'dist/liga madariaga.png',
  Comunicaciones: 'dist/liga comu.png',
  Guaraní: 'dist/liga guarani.png',
  Panificación: 'dist/liga pani.png',
  Barraca: 'dist/liga barraca.png',
  Güemes: 'dist/liga guemes.png',
  Marítimos: 'dist/Maritimo FC logo.png',
  'Puente Seco': 'dist/liga puente seco.png'
  // Los Catangos no tiene escudo de origen - se carga a mano desde el admin.
}

const LEAGUE_FILE = 'liga libreña futbol.png'

async function uploadOne(target, id, relPath) {
  const buffer = await readFile(path.join(root, relPath))
  const png = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const objectPath = `${target}-${id}.png`
  const { error: uploadError } = await supabase.storage
    .from('crests')
    .upload(objectPath, png, { contentType: 'image/png', upsert: true })
  if (uploadError) throw new Error(`upload ${objectPath}: ${uploadError.message}`)

  const { data } = supabase.storage.from('crests').getPublicUrl(objectPath)
  const logoUrl = `${data.publicUrl}?v=${Date.now()}`

  const table = target === 'team' ? 'teams' : 'leagues'
  const { error: updateError } = await supabase.from(table).update({ logo_url: logoUrl }).eq('id', id)
  if (updateError) throw new Error(`update ${table} ${id}: ${updateError.message}`)

  return logoUrl
}

async function main() {
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('slug', 'liga-librena')
    .single()
  if (leagueError) throw leagueError

  const url = await uploadOne('league', league.id, LEAGUE_FILE)
  console.log(`✓ ${league.name} -> ${url}`)

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', league.id)
  if (teamsError) throw teamsError

  for (const [name, relPath] of Object.entries(TEAM_FILES)) {
    const team = teams.find((t) => t.name === name)
    if (!team) {
      console.warn(`⚠ equipo no encontrado: ${name}`)
      continue
    }
    const logoUrl = await uploadOne('team', team.id, relPath)
    console.log(`✓ ${name} -> ${logoUrl}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
