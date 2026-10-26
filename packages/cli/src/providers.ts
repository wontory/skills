import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Skill } from './selection.ts'
import type { Fetcher, FreeSource, PaidSource } from './sources.ts'
import { cacheDir } from './config.ts'

export type { Fetcher } from './sources.ts'

export interface DiscoverOptions {
  fetcher?: Fetcher
  /** GitHub token for a higher API rate limit (`GITHUB_TOKEN` / `GH_TOKEN`). */
  githubToken?: string
  /** Max parallel SKILL.md downloads. */
  concurrency?: number
  /** Cache directory; `null` disables the cache. */
  cacheDir?: string | null
  /** Cache lifetime in ms. */
  cacheTtlMs?: number
  /** Ignore cached results. */
  refresh?: boolean
  now?: () => number
}

const DEFAULT_TTL = 60 * 60 * 1000

/** Directories that never hold installable skills. */
const IGNORED_DIRS = /(^|\/)(node_modules|\.git|dist|build|test|tests|__tests__|fixtures?)\//i

/** Skill ids are passed to installers as arguments, so they must never look like flags. */
export const isSafeId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)

/** Parses the YAML-ish frontmatter of a SKILL.md into a skill, or `undefined` if not installable. */
export function parseSkill(content: string): Skill | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const fm = match[1]!

  if (/^internal:\s*true\s*$/im.test(fm)) return undefined

  const name = readScalar(fm, 'name')
  if (!isSafeId(name)) return undefined

  const description = readScalar(fm, 'description')
  return description ? { id: name, name, description } : { id: name, name }
}

/** Reads a top-level scalar: plain, quoted, or a `>`/`|` block (folded to one line). */
function readScalar(frontmatter: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm')
  const m = frontmatter.match(re)
  if (!m) return undefined
  const rest = m[1]!.trim()

  if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
    const after = frontmatter.slice(m.index! + m[0].length)
    const lines: string[] = []
    for (const line of after.split(/\r?\n/)) {
      if (lines.length === 0 && line.trim() === '') continue
      if (!/^\s+\S/.test(line)) break
      lines.push(line.trim())
    }
    return lines.join(' ') || undefined
  }

  const quoted = rest.match(/^"((?:[^"\\]|\\.)*)"|^'((?:[^']|'')*)'/)
  if (quoted) {
    return quoted[1] !== undefined
      ? quoted[1].replaceAll(/\\(["\\])/g, '$1')
      : quoted[2]!.replaceAll("''", "'")
  }
  return rest.replace(/\s+#.*$/, '').trim() || undefined
}

/** `name` kept for backwards compatibility with earlier callers. */
export const parseSkillName = (content: string): string | undefined => parseSkill(content)?.name

interface CacheEntry {
  fetchedAt: number
  skills: Skill[]
}

const cacheFile = (dir: string, source: FreeSource): string =>
  path.join(dir, `${source.repo.replaceAll('/', '__')}.json`)

async function readCache(
  dir: string,
  source: FreeSource,
  ttl: number,
  now: number,
): Promise<Skill[] | undefined> {
  try {
    const entry = JSON.parse(await readFile(cacheFile(dir, source), 'utf8')) as CacheEntry
    if (typeof entry.fetchedAt !== 'number' || !Array.isArray(entry.skills)) return undefined
    if (now - entry.fetchedAt > ttl) return undefined
    // Cached ids are re-validated: they end up as subprocess arguments.
    if (!entry.skills.every((s) => isSafeId(s?.id) && typeof s.name === 'string')) return undefined
    return entry.skills
  } catch {
    return undefined
  }
}

async function writeCache(dir: string, source: FreeSource, skills: Skill[], now: number) {
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const entry: CacheEntry = { fetchedAt: now, skills }
    await writeFile(cacheFile(dir, source), JSON.stringify(entry))
  } catch {
    // A failed cache write must never fail discovery.
  }
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'wontory-skills',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function describeGithubFailure(res: Response, what: string, source: FreeSource): Error {
  const remaining = res.headers.get('x-ratelimit-remaining')
  if ((res.status === 403 || res.status === 429) && remaining === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const when =
      Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toLocaleTimeString() : 'soon'
    return new Error(
      `GitHub API rate limit reached while ${what} for ${source.name} (resets ${when}). ` +
        'Set GITHUB_TOKEN to raise the limit, or retry later to reuse the cache.',
    )
  }
  if (res.status === 404) {
    return new Error(`Repository ${source.repo} was not found (${source.name})`)
  }
  return new Error(`Failed ${what} for ${source.name} (HTTP ${res.status})`)
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Lists the skills a public GitHub repo offers by reading every `SKILL.md`
 * frontmatter on its default branch. Results are cached on disk.
 */
export async function discoverFree(
  source: FreeSource,
  opts: DiscoverOptions = {},
): Promise<Skill[]> {
  const fetcher = opts.fetcher ?? fetch
  const now = opts.now ?? Date.now
  const dir = opts.cacheDir === undefined ? cacheDir() : opts.cacheDir
  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL

  if (dir && !opts.refresh) {
    const cached = await readCache(dir, source, ttl, now())
    if (cached) return cached
  }

  const headers = githubHeaders(opts.githubToken)

  const repoRes = await fetcher(`https://api.github.com/repos/${source.repo}`, { headers })
  if (!repoRes.ok) throw describeGithubFailure(repoRes, 'fetching repo info', source)
  const repoData = (await repoRes.json()) as { default_branch?: string }
  const branch = repoData.default_branch || 'main'

  const treeRes = await fetcher(
    `https://api.github.com/repos/${source.repo}/git/trees/${branch}?recursive=1`,
    { headers },
  )
  if (!treeRes.ok) throw describeGithubFailure(treeRes, 'fetching file tree', source)
  const treeData = (await treeRes.json()) as {
    truncated?: boolean
    tree?: Array<{ type: string; path: string }>
  }
  if (treeData.truncated) {
    throw new Error(`GitHub tree response was incomplete (truncated) for ${source.name}`)
  }

  const files = (treeData.tree || [])
    .filter((item) => item.type === 'blob' && /(^|\/)SKILL\.md$/.test(item.path))
    .filter((item) => !IGNORED_DIRS.test(item.path))
    .map((item) => item.path)
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))

  let failures = 0
  const found = await mapLimit(files, opts.concurrency ?? 8, async (file) => {
    try {
      const res = await fetcher(
        `https://raw.githubusercontent.com/${source.repo}/${branch}/${file}`,
        { headers: { 'User-Agent': 'wontory-skills' } },
      )
      if (!res.ok) {
        failures++
        return undefined
      }
      return parseSkill(await res.text())
    } catch {
      failures++
      return undefined
    }
  })

  // Shallowest path wins when two SKILL.md files share a name.
  const byName = new Map<string, Skill>()
  for (const skill of found) {
    if (skill && !byName.has(skill.id)) byName.set(skill.id, skill)
  }
  const skills = [...byName.values()]

  // A list with holes (a download failed) is returned but never cached, so the
  // missing skills are not reported as "unknown" for the next hour.
  if (dir && !failures) await writeCache(dir, source, skills, now())
  return skills
}

export async function fetchPaidCatalog(
  source: PaidSource,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<Skill[]> {
  const url = new URL(source.endpoint)
  url.searchParams.set('token', token)

  let res: Response
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new Error(`Unable to reach ${source.name}. Check your connection and try again.`)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Invalid token for ${source.name}`)
    }
    throw new Error(`Unable to reach ${source.name} (HTTP ${res.status})`)
  }

  let data: { skills?: Array<{ id?: unknown; name?: unknown; description?: unknown }> }
  try {
    data = (await res.json()) as typeof data
  } catch {
    throw new Error(`Invalid response from ${source.name}`)
  }

  if (!Array.isArray(data?.skills)) throw new Error(`Invalid response from ${source.name}`)

  const skills: Skill[] = []
  for (const s of data.skills) {
    // Ids become installer arguments; drop anything that could read as a flag.
    if (!isSafeId(s?.id)) continue
    const skill: Skill = { id: s.id, name: typeof s.name === 'string' && s.name ? s.name : s.id }
    if (typeof s.description === 'string' && s.description) skill.description = s.description
    skills.push(skill)
  }
  return skills
}
