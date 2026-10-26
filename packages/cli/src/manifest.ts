import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MANIFEST_FILE = 'wontory-skills.json'

/**
 * Project manifest committed next to the code so every teammate installs the
 * same skills with a bare `npx @wontory/skills`.
 *
 * ```json
 * {
 *   "scope": "project",
 *   "agents": ["claude-code"],
 *   "skills": { "wontory/skills": ["commit", "pr"], "animations.dev": ["*"] }
 * }
 * ```
 *
 * `"*"` means every skill the source offers at install time.
 */
export interface Manifest {
  scope?: 'project' | 'global'
  /** Agent ids, or `['*']` for all. */
  agents?: string[]
  /** Source name -> skill ids (or `['*']`). */
  skills: Record<string, string[]>
}

export const manifestPath = (cwd = process.cwd()): string => path.join(cwd, MANIFEST_FILE)

export function parseManifest(raw: string): Manifest {
  const data = JSON.parse(raw) as unknown
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('manifest must be a JSON object')
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.skills !== 'object' || obj.skills === null || Array.isArray(obj.skills)) {
    throw new Error('manifest "skills" must be an object of source -> skill ids')
  }

  const skills: Record<string, string[]> = {}
  for (const [source, ids] of Object.entries(obj.skills as Record<string, unknown>)) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw new Error(`manifest "skills.${source}" must be an array of strings`)
    }
    if (ids.length > 0) skills[source] = ids as string[]
  }

  const manifest: Manifest = { skills }
  if (obj.scope !== undefined) {
    if (obj.scope !== 'project' && obj.scope !== 'global') {
      throw new Error('manifest "scope" must be "project" or "global"')
    }
    manifest.scope = obj.scope
  }
  if (obj.agents !== undefined) {
    if (!Array.isArray(obj.agents) || !obj.agents.every((a) => typeof a === 'string')) {
      throw new Error('manifest "agents" must be an array of strings')
    }
    manifest.agents = obj.agents as string[]
  }
  return manifest
}

/** Returns `undefined` when there is no manifest; throws when one exists but is invalid. */
export async function loadManifest(file = manifestPath()): Promise<Manifest | undefined> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
  try {
    return parseManifest(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid ${MANIFEST_FILE}: ${msg}`)
  }
}

export async function saveManifest(manifest: Manifest, file = manifestPath()): Promise<void> {
  const ordered: Manifest = {
    ...(manifest.scope ? { scope: manifest.scope } : {}),
    ...(manifest.agents ? { agents: manifest.agents } : {}),
    skills: manifest.skills,
  }
  await writeFile(file, JSON.stringify(ordered, null, 2) + '\n')
}
