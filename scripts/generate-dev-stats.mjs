import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const lines = (value) => value ? value.split('\n').filter(Boolean) : []
const commits = lines(git('rev-list', 'main')).map((hash) => {
  const [subject, date, parents] = git('show', '-s', '--format=%s%x1f%aI%x1f%P', hash).split('\x1f')
  return { hash, subject, date, parents: parents.split(' ').filter(Boolean) }
})
const sourceByHash = new Map()
for (const merge of commits.filter((c) => c.parents.length > 1)) {
  const source = merge.subject.startsWith('Merge codex/') ? 'codex' : merge.subject.startsWith('Merge agent/') ? 'subagent' : null
  if (!source) continue
  for (const hash of lines(git('rev-list', merge.parents[1], '--not', merge.parents[0]))) sourceByHash.set(hash, source)
}
const categories = { direct: { label: 'Claude Code directo', commits: 0, additions: 0, deletions: 0 }, codex: { label: 'Codex CLI', commits: 0, additions: 0, deletions: 0 }, subagent: { label: 'Claude sub-agent', commits: 0, additions: 0, deletions: 0 } }
for (const commit of commits) {
  const key = sourceByHash.get(commit.hash) ?? 'direct'
  const match = git('show', '--shortstat', '--format=', commit.hash).match(/(\d+) insertion(?:s|)\(\+\), (\d+) deletion(?:s|-)\(-\)/)
  categories[key].commits++
  categories[key].additions += Number(match?.[1] ?? 0)
  categories[key].deletions += Number(match?.[2] ?? 0)
}
const touched = new Set(lines(git('log', '--all', '--format=', '--name-only')))
const diary = lines(git('log', '--first-parent', 'main', '--format=%H%x1f%aI%x1f%s')).map((row) => { const [hash, date, subject] = row.split('\x1f'); return { hash, date, subject } })
const countFiles = (dir, suffix) => { let total = 0; const walk = (path) => { for (const name of readdirSync(path)) { const full = join(path, name); const stat = statSync(full); if (stat.isDirectory()) walk(full); else if (name.endsWith(suffix)) total++ } }; walk(join(root, dir)); return total }
const firstDate = commits.at(-1)?.date ?? null
const lastDate = commits[0]?.date ?? null
const elapsedMs = firstDate && lastDate ? new Date(lastDate) - new Date(firstDate) : 0
const elapsedDays = Math.round(elapsedMs / 86400000)
const elapsedHours = Math.round(elapsedMs / 3600000)
const output = { generatedAt: new Date().toISOString(), totalCommits: commits.length, firstCommitDate: firstDate, latestCommitDate: lastDate, elapsedDays, elapsedHours, totalAdditions: Object.values(categories).reduce((n, c) => n + c.additions, 0), totalDeletions: Object.values(categories).reduce((n, c) => n + c.deletions, 0), uniqueFiles: touched.size, categories, diary, current: { migrations: countFiles('supabase/migrations', '.sql'), pages: countFiles('pages', '.vue'), apiRoutes: countFiles('server/api', '.ts'), composables: countFiles('composables', '.ts') } }
// Nota: esto va a server/data (no public/) porque la página la lee vía una ruta de
// API (server/api/dev-stats.get.ts) con un `import` estático del JSON, no con un
// useFetch a un archivo estático. Un useFetch SSR a un asset de public/ devuelve
// 404 en modo dev (Nitro no lo resuelve por esa vía interna, aunque el navegador
// sí lo ve bien por afuera) - una ruta de API de verdad evita ese problema tanto
// en dev como en producción, y el import estático hace que el JSON quede
// embebido en el bundle del servidor en vez de depender de leer un archivo en runtime.
mkdirSync(join(root, 'server/data'), { recursive: true })
writeFileSync(join(root, 'server/data/dev-stats.json'), JSON.stringify(output, null, 2) + '\n')
console.log(`Generated ${output.totalCommits} commits: ${output.totalAdditions}+ / ${output.totalDeletions}-`)
