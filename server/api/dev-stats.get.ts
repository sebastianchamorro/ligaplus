// Import estático a propósito: Nitro lo embebe en el bundle del servidor al
// compilar, así que no depende de leer un archivo en runtime (más seguro para
// un deploy serverless) ni de una ruta de asset estático (ver la nota en
// scripts/generate-dev-stats.mjs sobre por qué un useFetch a public/ falla en SSR).
import stats from '../data/dev-stats.json'

export default defineEventHandler(() => stats)
