import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { type Catalog, type PaidSource, parseCatalog, tokenEnv, tokenOption } from './sources.ts'

/**
 * User-level config at `$XDG_CONFIG_HOME/wontory-skills/config.json`
 * (or `~/.config/wontory-skills/config.json`).
 *
 * ```json
 * { "tokens": { "animationsdev": "..." }, "sources": { "free": [...], "paid": [...] } }
 * ```
 */
export interface InstallDefaults {
  scope?: 'project' | 'global'
  agents?: string[]
}

export interface UserConfig {
  tokens: Record<string, string>
  sources: Catalog
  /** Last answers to the scope/agent prompts, offered as defaults next time. */
  defaults: InstallDefaults
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.WONTORY_SKILLS_CONFIG_DIR ||
    (env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, 'wontory-skills') : undefined) ||
    path.join(homedir(), '.config', 'wontory-skills')
  return base
}

export const configPath = (env?: NodeJS.ProcessEnv): string =>
  path.join(configDir(env), 'config.json')

/**
 * Per-user cache dir. Deliberately not the shared system temp dir, where another
 * local user could pre-create the directory or plant a symlink.
 */
export function cacheDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.WONTORY_SKILLS_CACHE_DIR) return env.WONTORY_SKILLS_CACHE_DIR
  if (env.XDG_CACHE_HOME) return path.join(env.XDG_CACHE_HOME, 'wontory-skills')
  if (platform === 'win32' && env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'wontory-skills', 'cache')
  }
  return path.join(homedir(), '.cache', 'wontory-skills')
}

const emptyConfig = (): UserConfig => ({
  tokens: {},
  sources: { free: [], paid: [] },
  defaults: {},
})

export async function loadUserConfig(file = configPath()): Promise<UserConfig> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return emptyConfig()
  }
  try {
    const data = JSON.parse(raw) as unknown
    if (typeof data !== 'object' || data === null) return emptyConfig()
    const obj = data as Record<string, unknown>
    const tokens: Record<string, string> = {}
    if (typeof obj.tokens === 'object' && obj.tokens !== null) {
      for (const [k, v] of Object.entries(obj.tokens as Record<string, unknown>)) {
        if (typeof v === 'string' && v) tokens[k] = v
      }
    }
    const defaults: InstallDefaults = {}
    if (typeof obj.defaults === 'object' && obj.defaults !== null) {
      const d = obj.defaults as Record<string, unknown>
      if (d.scope === 'project' || d.scope === 'global') defaults.scope = d.scope
      if (Array.isArray(d.agents) && d.agents.every((a) => typeof a === 'string' && a)) {
        defaults.agents = d.agents as string[]
      }
    }
    return { tokens, sources: parseCatalog(obj.sources), defaults }
  } catch {
    return emptyConfig()
  }
}

export async function saveUserConfig(config: UserConfig, file = configPath()): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const data = {
    tokens: config.tokens,
    defaults: config.defaults,
    sources: {
      free: config.sources.free.map(({ kind: _kind, ...rest }) => rest),
      paid: config.sources.paid.map(({ kind: _kind, ...rest }) => rest),
    },
  }
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

/**
 * Resolves a paid source's token. Precedence: CLI flag > environment > saved config.
 * Returns where it came from so the workflow knows whether it is worth saving.
 */
export function resolveToken(
  source: PaidSource,
  flags: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  config: UserConfig,
): { token: string; from: 'flag' | 'env' | 'config' } | undefined {
  const flag = flags[tokenOption(source)]
  if (typeof flag === 'string' && flag) return { token: flag, from: 'flag' }
  const fromEnv = env[tokenEnv(source)]
  if (fromEnv) return { token: fromEnv, from: 'env' }
  const saved = config.tokens[source.id]
  if (saved) return { token: saved, from: 'config' }
  return undefined
}
