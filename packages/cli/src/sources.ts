import bundled from '../../../sources.json' with { type: 'json' }

/** Public repos installed with `npx skills add <repo>`. */
export interface FreeSource {
  kind: 'free'
  name: string
  repo: string
  description?: string
  /** Skill ids preselected for first-time users (`['*']` = all). */
  recommended?: string[]
}

/** Paid skills installed with `npx <installer> --token=<token>`. */
export interface PaidSource {
  kind: 'paid'
  /** Short id used to derive the `--<id>-token` flag and the `<ID>_TOKEN` env var. */
  id: string
  name: string
  installer: string
  /** Returns `{ skills: [{ id, name?, description? }] }` when called with `?token=`. */
  endpoint: string
  description?: string
  /** Where a user gets a token; shown next to the token field. */
  tokenUrl?: string
}

export type Source = FreeSource | PaidSource

/** Narrower than `typeof fetch` so tests can pass a plain async function. */
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface Catalog {
  free: FreeSource[]
  paid: PaidSource[]
}

/** Where the live catalog lives. Lets us add sources without shipping a new CLI. */
export const REMOTE_CATALOG_URL =
  'https://raw.githubusercontent.com/wontory/skills/main/sources.json'

export const tokenFlag = (source: PaidSource): string => `--${source.id}-token`
/** cac exposes `--foo-token` as `fooToken`. */
export const tokenOption = (source: PaidSource): string =>
  `${source.id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}Token`
export const tokenEnv = (source: PaidSource): string =>
  `${source.id.toUpperCase().replaceAll('-', '_')}_TOKEN`

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Validates untrusted JSON into a catalog, dropping malformed entries. */
export function parseCatalog(data: unknown): Catalog {
  const catalog: Catalog = { free: [], paid: [] }
  if (!isRecord(data)) return catalog

  if (Array.isArray(data.free)) {
    for (const item of data.free) {
      if (!isRecord(item)) continue
      const repo = str(item.repo)
      if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) continue
      const recommended =
        item.recommended === true
          ? ['*']
          : Array.isArray(item.recommended)
            ? item.recommended.filter((x): x is string => typeof x === 'string' && x.length > 0)
            : undefined
      catalog.free.push({
        kind: 'free',
        name: str(item.name) ?? repo,
        repo,
        description: str(item.description),
        ...(recommended?.length ? { recommended } : {}),
      })
    }
  }

  if (Array.isArray(data.paid)) {
    for (const item of data.paid) {
      if (!isRecord(item)) continue
      const id = str(item.id)
      const installer = str(item.installer)
      const endpoint = str(item.endpoint)
      // Segments start with a letter so cac's camelCase matches `tokenOption`.
      if (!id || !/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/.test(id) || !installer || !endpoint) continue
      if (!endpoint.startsWith('https://')) continue
      catalog.paid.push({
        kind: 'paid',
        id,
        name: str(item.name) ?? id,
        installer,
        endpoint,
        description: str(item.description),
        ...(str(item.tokenUrl)?.startsWith('https://') ? { tokenUrl: str(item.tokenUrl) } : {}),
      })
    }
  }

  return catalog
}

export const BUNDLED_CATALOG: Catalog = parseCatalog(bundled)

/** Later catalogs override earlier ones by source name. */
export function mergeCatalogs(...catalogs: Catalog[]): Catalog {
  const free = new Map<string, FreeSource>()
  const paid = new Map<string, PaidSource>()
  for (const c of catalogs) {
    for (const s of c.free) free.set(s.name, s)
    for (const s of c.paid) paid.set(s.name, s)
  }
  return { free: [...free.values()], paid: [...paid.values()] }
}

/**
 * The live catalog may add sources and fix descriptions, but it must not be able
 * to redirect a known paid provider: saved tokens are sent to `endpoint`
 * automatically, so those fields stay pinned to the bundled copy.
 */
export function pinBundledEndpoints(catalog: Catalog, bundled: Catalog = BUNDLED_CATALOG): Catalog {
  const trusted = new Map(bundled.paid.map((s) => [s.id, s]))
  return {
    free: catalog.free,
    paid: catalog.paid.map((s) => {
      const t = trusted.get(s.id)
      return t ? { ...s, installer: t.installer, endpoint: t.endpoint } : s
    }),
  }
}

export const allSources = (catalog: Catalog): Source[] => [...catalog.free, ...catalog.paid]

/** Finds a source by name, repo, or paid id. */
export function findSource(catalog: Catalog, ref: string): Source | undefined {
  const needle = ref.toLowerCase()
  return allSources(catalog).find(
    (s) =>
      s.name.toLowerCase() === needle ||
      (s.kind === 'free' && s.repo.toLowerCase() === needle) ||
      (s.kind === 'paid' && s.id === needle),
  )
}

/**
 * Fetches the live catalog. Falls back to the bundled copy when the network is
 * unavailable or the response is unusable, so the CLI keeps working offline.
 */
export async function loadRemoteCatalog(
  fetcher: Fetcher = fetch,
  timeoutMs = 3000,
): Promise<{ catalog: Catalog; remote: boolean }> {
  try {
    const res = await fetcher(REMOTE_CATALOG_URL, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { catalog: BUNDLED_CATALOG, remote: false }
    const catalog = parseCatalog(await res.json())
    if (catalog.free.length + catalog.paid.length === 0) {
      return { catalog: BUNDLED_CATALOG, remote: false }
    }
    return { catalog, remote: true }
  } catch {
    return { catalog: BUNDLED_CATALOG, remote: false }
  }
}
