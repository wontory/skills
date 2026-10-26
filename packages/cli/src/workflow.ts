import { unicodeOr } from '@clack/prompts'
import type { Skill, SkillGroup } from './selection.ts'
import type { Manifest } from './manifest.ts'
import {
  type Catalog,
  type FreeSource,
  type PaidSource,
  type Source,
  allSources,
  findSource,
} from './sources.ts'
import { ALL_AGENTS, knownAgent } from './agents.ts'
import { formatCommand } from './runner.ts'
import type { SelectSkillsOptions } from './terminal.ts'
import { MANIFEST_FILE } from './manifest.ts'
import { CancelledError } from './errors.ts'
import type { InstallDefaults } from './config.ts'

export interface WorkflowOptions {
  /** `true` = `--global`, `false` = `--project`, `undefined` = not given (manifest or prompt decides). */
  global?: boolean
  /** Agent ids, or `['*']`. Empty means "not given". */
  agents?: string[]
  yes?: boolean
  /** Skill filters: `name` (any source) or `source@name`. */
  skills?: string[]
  /** Restrict to these sources (names, repos, or paid ids). */
  sources?: string[]
  skipPaid?: boolean
  dryRun?: boolean
  /** Write the final selection to the project manifest. */
  save?: boolean
  /** Persist tokens to the user config. */
  saveTokens?: boolean
  /** Show the picker even when a manifest exists. */
  interactive?: boolean
}

export interface ResolvedToken {
  token: string
  from: 'flag' | 'env' | 'config' | 'prompt'
}

export interface WorkflowContext {
  options: WorkflowOptions
  isInteractive: boolean
  catalog: Catalog
  manifest?: Manifest
  /** Tokens known before the picker opens, by paid source id. */
  tokens: Map<string, ResolvedToken>
  selectSkills: (
    groups: SkillGroup[],
    loadCatalog: (groupId: string, token: string) => Promise<Skill[]>,
    opts?: SelectSkillsOptions,
  ) => Promise<Map<string, string[]>>
  promptScope: () => Promise<'project' | 'global'>
  /** Resolves to agent ids, or `['*']` for all agents. */
  promptAgents: () => Promise<string[]>
  confirm: (message: string, initial?: boolean) => Promise<boolean>
  discoverFree: (source: FreeSource) => Promise<Skill[]>
  fetchPaidCatalog: (source: PaidSource, token: string) => Promise<Skill[]>
  run: (cmd: string, args: string[]) => Promise<number>
  /**
   * Silent run with captured output. When present, free installs use the
   * `skills` CLI's `--json` mode and are rendered by us instead of streaming
   * the installer's own UI into the middle of ours.
   */
  runCaptured?: (
    cmd: string,
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>
  saveManifest: (manifest: Manifest) => Promise<void>
  saveTokens: (tokens: Record<string, string>) => Promise<void>
  log: {
    step: (msg: string) => void
    info: (msg: string) => void
    warn: (msg: string) => void
    error: (msg: string) => void
    message: (msg: string) => void
    /** Boxed multi-line note, e.g. next steps. Falls back to `message` when absent. */
    note?: (body: string, title: string) => void
  }
  /** Long-running feedback (a spinner in a terminal). */
  progress?: {
    start: (msg: string) => void
    message: (msg: string) => void
    stop: (msg: string) => void
  }
  /** Last answers to the scope/agents prompts, used as prompt defaults. */
  defaults?: InstallDefaults
  saveDefaults?: (defaults: InstallDefaults) => Promise<void>
}

export interface Plan {
  /** Source name -> selected skill ids. */
  selection: Map<string, string[]>
  /** Whether the selection came from the interactive picker. */
  fromPicker: boolean
  fromManifest: boolean
}

export interface InstallCommand {
  source: Source
  cmd: string
  args: string[]
  secrets: string[]
}

export class WorkflowError extends Error {}

const NPX = 'npx'

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

/** Applies `--source` and `--skip-paid`. Unknown refs are errors so typos fail fast. */
export function resolveSources(catalog: Catalog, options: WorkflowOptions): Source[] {
  let sources = allSources(catalog)
  if (options.sources?.length) {
    const picked: Source[] = []
    const unknown: string[] = []
    for (const ref of options.sources) {
      const found = findSource(catalog, ref)
      if (found) {
        if (!picked.includes(found)) picked.push(found)
      } else unknown.push(ref)
    }
    if (unknown.length) {
      throw new WorkflowError(
        `Unknown source${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. ` +
          `Known: ${sources.map((s) => s.name).join(', ')}. ` +
          'Pass a GitHub owner/repo to add a new one.',
      )
    }
    sources = picked
  }
  if (options.skipPaid) sources = sources.filter((s) => s.kind === 'free')
  return sources
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface Discovered {
  groups: SkillGroup[]
  /** Paid sources with a usable token, by source name. */
  paidTokens: Map<string, ResolvedToken>
}

export interface Discovery extends Discovered {
  /** Resolves once every group has loaded. */
  ready: Promise<Discovered>
  /** Called with a group id each time that group finishes loading. */
  onGroupLoaded: (cb: (groupId: string) => void) => void
  /** Per-source status text, e.g. "4", "token required", "unavailable". */
  status: Map<string, string>
  /** Error messages collected while loading, in arrival order. */
  errors: string[]
}

/**
 * Starts loading every source in parallel and returns the groups immediately,
 * marked `loading`. Each group is filled in place when its lookup finishes, so
 * the picker can open at once and grow as results arrive. Failures become
 * group errors, not crashes.
 */
export function startDiscovery(ctx: WorkflowContext, sources: Source[]): Discovery {
  const paidTokens = new Map<string, ResolvedToken>()
  const errors: string[] = []
  const status = new Map<string, string>()
  const listeners: ((groupId: string) => void)[] = []
  const groups: SkillGroup[] = sources.map((source) => ({
    id: source.name,
    name: source.name,
    kind: source.kind,
    description: source.description,
    skills: [],
    loading: true,
    ...(source.kind === 'paid' ? { locked: true, tokenUrl: source.tokenUrl } : {}),
  }))

  const finish = (group: SkillGroup, text: string, patch: Partial<SkillGroup>) => {
    Object.assign(group, patch, { loading: false })
    status.set(group.id, text)
    for (const cb of listeners) cb(group.id)
  }

  const ready = Promise.all(
    sources.map(async (source, i) => {
      const group = groups[i]!
      if (source.kind === 'free') {
        try {
          const skills = await ctx.discoverFree(source)
          finish(group, `${skills.length}`, { skills })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(msg)
          finish(group, 'unavailable', { error: msg })
        }
        return
      }
      const token = ctx.tokens.get(source.id)
      if (!token) {
        finish(group, 'token required', { locked: true })
        return
      }
      try {
        const skills = await ctx.fetchPaidCatalog(source, token.token)
        paidTokens.set(source.name, token)
        finish(group, `${skills.length}`, { skills, locked: false })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${msg} (token from ${token.from})`)
        finish(group, 'token rejected', { locked: true, error: msg })
      }
    }),
  ).then(() => ({ groups, paidTokens }))

  return {
    groups,
    paidTokens,
    ready,
    status,
    errors,
    onGroupLoaded: (cb) => {
      listeners.push(cb)
    },
  }
}

/** One-line summary in source order, e.g. "wontory/skills 4 · obra/superpowers 15 · animations.dev token required". */
export const discoverySummary = (sources: Source[], status: Map<string, string>): string =>
  sources.map((s) => `${s.name} ${status.get(s.name) ?? '?'}`).join(' · ')

/** Loads every source to completion, reporting progress on the spinner when there is one. */
export async function discover(ctx: WorkflowContext, sources: Source[]): Promise<Discovered> {
  const d = startDiscovery(ctx, sources)
  const label = `Looking up skills from ${sources.length} source${sources.length === 1 ? '' : 's'}`
  ctx.progress?.start(label)
  d.onGroupLoaded(() => {
    const done = [...d.status].map(([n, t]) => `${n} ${t}`).join(' · ')
    ctx.progress?.message(`${label} (${d.status.size}/${sources.length})  ${done}`)
  })
  const result = await d.ready
  const summary = discoverySummary(sources, d.status)
  ctx.progress?.stop(summary)
  if (!ctx.progress) ctx.log.step(summary)
  // Errors are logged after the spinner stops so they are not overwritten by it.
  for (const msg of d.errors) ctx.log.error(msg)
  return result
}

/**
 * First-run preselection: every recommended free skill. Verified paid sources
 * are covered by `selectVerifiedPaid`, which also works for groups that are
 * still loading when the picker opens.
 */
export function recommendedSelection(catalog: Catalog): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const source of catalog.free) {
    if (source.recommended?.length) map.set(source.name, source.recommended)
  }
  return map
}

// ---------------------------------------------------------------------------
// Installed state and installer output
// ---------------------------------------------------------------------------

/** What `npx skills list --json` reports for one skill. */
interface InstalledSkill {
  name: string
  scope?: string
}

/** Names already installed in the given scope, or `undefined` when that cannot be determined. */
async function installedSkillNames(
  ctx: WorkflowContext,
  global: boolean,
): Promise<Set<string> | undefined> {
  if (!ctx.runCaptured) return undefined
  try {
    const out = await ctx.runCaptured(NPX, [
      '-y',
      'skills',
      'list',
      ...(global ? ['-g'] : []),
      '--json',
    ])
    if (out.code !== 0) return undefined
    const data = JSON.parse(out.stdout.slice(out.stdout.indexOf('['))) as unknown
    if (!Array.isArray(data)) return undefined
    return new Set(
      (data as InstalledSkill[]).filter((s) => typeof s?.name === 'string').map((s) => s.name),
    )
  } catch {
    return undefined
  }
}

/** One entry per skill in `skills add --json` output. */
export interface AddResult {
  name?: string
  status: 'installed' | 'skipped' | 'failed'
  path?: string
  agents?: string[]
  reason?: string
  error?: string
}

/** Parses the JSON array `skills add --json` prints; tolerant of stray text before it. */
export function parseAddResults(stdout: string): AddResult[] | undefined {
  const start = stdout.indexOf('[')
  if (start === -1) return undefined
  try {
    const data = JSON.parse(stdout.slice(start)) as unknown
    if (!Array.isArray(data)) return undefined
    return data.filter(
      (r): r is AddResult =>
        typeof r === 'object' && r !== null && typeof (r as AddResult).status === 'string',
    )
  } catch {
    return undefined
  }
}

export interface SourceOutcome {
  name: string
  status: 'ok' | 'failed'
  installed: string[]
  /** Subset of `installed` that was not present before this run. */
  fresh: string[]
  failed: { name: string; error: string }[]
  skipped: { name: string; reason: string }[]
}

/** Formats one source's outcome as a summary line. */
export function formatOutcome(o: SourceOutcome): string {
  // ✓/✗ (U+2713/U+2717) have no emoji presentation; ✔/✖ do and render double-width in many terminals.
  const mark = o.status === 'ok' ? unicodeOr('✓', '+') : unicodeOr('✗', 'x')
  const parts: string[] = []
  if (o.installed.length) {
    const refreshed = o.installed.length - o.fresh.length
    const label =
      o.fresh.length && refreshed
        ? `${o.fresh.length} new, ${refreshed} refreshed`
        : o.fresh.length
          ? `${o.fresh.length} new`
          : refreshed
            ? `${refreshed} refreshed`
            : `${o.installed.length} installed`
    parts.push(`${label}: ${o.installed.join(', ')}`)
  }
  if (o.skipped.length) parts.push(`skipped ${o.skipped.map((s) => s.name).join(', ')}`)
  if (o.failed.length) parts.push(`failed ${o.failed.map((f) => f.name).join(', ')}`)
  return `${mark} ${o.name}${parts.length ? `  ${parts.join(' · ')}` : ''}`
}

/** Last lines of an installer's stderr, for when it fails and the user needs the real message. */
const tail = (text: string, lines = 15): string =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-lines)
    .join('\n')

/** Where to go after a successful install. */
export function nextSteps(input: {
  global: boolean
  agents: string[]
  selection: Map<string, string[]>
  manifestSaved: boolean
  cwd?: string
  /** Counts from the installer, when it reported them. */
  fresh?: number
  refreshed?: number
}): string {
  const count = [...input.selection.values()].reduce((n, ids) => n + ids.length, 0)
  const where = input.global
    ? 'your user-level agent folders'
    : `this project (${input.cwd ?? process.cwd()})`
  const who = input.agents.includes(ALL_AGENTS)
    ? 'every agent the installer detected'
    : input.agents.join(', ')
  const breakdown =
    input.fresh !== undefined && input.refreshed !== undefined && input.fresh + input.refreshed > 0
      ? input.fresh === 0
        ? ' All of them were already installed and are now at the latest version.'
        : input.refreshed === 0
          ? ''
          : ` ${input.fresh} new, ${input.refreshed} refreshed to the latest version.`
      : ''
  const lines = [
    `${count} skill${count === 1 ? '' : 's'} installed into ${where} for ${who}.${breakdown}`,
    '',
    'Use them by asking your agent in plain words, or by name (for example /commit in Claude Code).',
    input.manifestSaved
      ? `Commit ${MANIFEST_FILE} so teammates get the same set with a bare npx @wontory/skills.`
      : `Run again with --save to write ${MANIFEST_FILE} for your team.`,
    `Change the selection with -i, refresh everything with "update", list what is installed with "installed".`,
  ]
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** Resolves `--skill` filters against discovered groups. */
export function planFromSkillFilters(
  groups: SkillGroup[],
  filters: string[],
  catalog?: Catalog,
): Map<string, string[]> {
  const selection = new Map<string, string[]>()
  const missing: string[] = []
  // `source@name` accepts the same refs as `--source`: name, owner/repo, or paid id.
  const sourceName = (ref: string): string => (catalog && findSource(catalog, ref)?.name) ?? ref

  for (const raw of filters) {
    const at = raw.lastIndexOf('@')
    const sourceRef = at > 0 ? raw.slice(0, at) : undefined
    const id = at > 0 ? raw.slice(at + 1) : raw
    if (!id) {
      missing.push(raw)
      continue
    }
    const wanted = sourceRef ? sourceName(sourceRef).toLowerCase() : undefined
    const candidates = groups.filter((g) => {
      if (g.locked) return false
      if (!wanted) return true
      return g.id.toLowerCase() === wanted
    })
    let found = false
    for (const g of candidates) {
      const match = id === '*' ? g.skills : g.skills.filter((s) => s.id === id || s.name === id)
      if (match.length === 0) continue
      found = true
      const list = selection.get(g.id) ?? []
      for (const s of match) if (!list.includes(s.id)) list.push(s.id)
      selection.set(g.id, list)
    }
    if (!found) missing.push(raw)
  }

  if (missing.length) {
    const available = groups
      .filter((g) => !g.locked && g.skills.length)
      .map((g) => `${g.id}: ${g.skills.map((s) => s.id).join(', ')}`)
      .join('\n  ')
    throw new WorkflowError(
      `Unknown skill${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}\nAvailable:\n  ${available}`,
    )
  }
  return selection
}

/** Resolves a manifest against discovered groups. Missing skills warn instead of failing. */
export function planFromManifest(
  groups: SkillGroup[],
  manifest: Manifest,
  warn: (msg: string) => void,
): Map<string, string[]> {
  const selection = new Map<string, string[]>()
  for (const [sourceName, ids] of Object.entries(manifest.skills)) {
    const group = groups.find((g) => g.id.toLowerCase() === sourceName.toLowerCase())
    if (!group) {
      warn(`${MANIFEST_FILE}: source "${sourceName}" is not in the catalog; skipped`)
      continue
    }
    if (group.locked) {
      warn(`${MANIFEST_FILE}: no token for ${group.name}; skipped`)
      continue
    }
    if (group.skills.length === 0) continue
    if (ids.includes('*')) {
      selection.set(
        group.id,
        group.skills.map((s) => s.id),
      )
      continue
    }
    const known = new Set(group.skills.map((s) => s.id))
    const picked = ids.filter((id) => known.has(id))
    const missing = ids.filter((id) => !known.has(id))
    if (missing.length) {
      warn(`${MANIFEST_FILE}: ${group.name} no longer offers ${missing.join(', ')}; skipped`)
    }
    if (picked.length) selection.set(group.id, picked)
  }
  return selection
}

/** Everything free plus every paid source that has a token. */
export function planEverything(groups: SkillGroup[]): Map<string, string[]> {
  const selection = new Map<string, string[]>()
  for (const g of groups) {
    if (g.locked || g.skills.length === 0) continue
    selection.set(
      g.id,
      g.skills.map((s) => s.id),
    )
  }
  return selection
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function buildCommands(
  sources: Source[],
  selection: Map<string, string[]>,
  tokens: Map<string, ResolvedToken>,
  scope: { global: boolean; agents: string[]; yes: boolean },
): InstallCommand[] {
  const commands: InstallCommand[] = []
  for (const source of sources) {
    const ids = selection.get(source.name)
    if (!ids?.length) continue
    if (source.kind === 'free') {
      commands.push({
        source,
        cmd: NPX,
        args: [
          '-y',
          'skills',
          'add',
          source.repo,
          '-s',
          ...ids,
          ...(scope.global ? ['-g'] : []),
          '-a',
          ...scope.agents,
          '-y',
        ],
        secrets: [],
      })
    } else {
      const token = tokens.get(source.name)
      if (!token) continue
      commands.push({
        source,
        cmd: NPX,
        args: [
          '-y',
          source.installer,
          `--token=${token.token}`,
          scope.global ? '-g' : '--project',
          ...(scope.yes ? ['-y'] : []),
          ...ids,
        ],
        secrets: [token.token],
      })
    }
  }
  return commands
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export async function runWorkflow(ctx: WorkflowContext): Promise<number> {
  try {
    return await install(ctx)
  } catch (err: unknown) {
    if (err instanceof WorkflowError) {
      ctx.log.error(err.message)
      return 1
    }
    throw err
  }
}

async function install(ctx: WorkflowContext): Promise<number> {
  const { options } = ctx
  const canAsk = ctx.isInteractive && !options.yes
  const sources = resolveSources(ctx.catalog, options)

  // Agent ids are validated up front so a typo does not surface after a long discovery.
  if (options.agents?.length) {
    const unknown = options.agents.filter((a) => !knownAgent(a))
    if (unknown.length) {
      ctx.log.warn(
        `Unrecognised agent${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} (passed through)`,
      )
    }
  }

  // 1 + 2. Discover and plan. The picker opens while sources are still loading;
  // every other path waits for discovery to finish first.
  const useManifest = Boolean(ctx.manifest) && !options.interactive && !options.skills?.length
  const usePicker = !options.skills?.length && !useManifest && canAsk
  const discovery = startDiscovery(ctx, sources)
  const { groups, paidTokens } = discovery
  const loadPaid = async (groupId: string, token: string): Promise<Skill[]> => {
    const source = ctx.catalog.paid.find((s) => s.name === groupId)
    if (!source) throw new Error(`Unknown paid source ${groupId}`)
    const skills = await ctx.fetchPaidCatalog(source, token)
    paidTokens.set(source.name, { token, from: 'prompt' })
    return skills
  }

  let plan: Plan
  if (usePicker) {
    // Start from the manifest when there is one, otherwise from the recommended set,
    // so the picker never opens empty.
    const preselect = ctx.manifest
      ? new Map(Object.entries(ctx.manifest.skills))
      : recommendedSelection(ctx.catalog)
    const notice = ctx.manifest
      ? `Your ${MANIFEST_FILE} selection is preselected`
      : preselect.size
        ? 'Recommended skills are preselected. Adjust, then press enter.'
        : undefined
    const selection = await ctx.selectSkills(groups, loadPaid, {
      preselect: preselect.size ? preselect : undefined,
      selectVerifiedPaid: !ctx.manifest,
      notice,
      onGroupLoaded: discovery.onGroupLoaded,
    })
    await discovery.ready
    for (const msg of discovery.errors) ctx.log.error(msg)
    plan = { selection, fromPicker: true, fromManifest: false }
  } else {
    const label = `Looking up skills from ${sources.length} source${sources.length === 1 ? '' : 's'}`
    ctx.progress?.start(label)
    discovery.onGroupLoaded(() => {
      const done = [...discovery.status].map(([n, t]) => `${n} ${t}`).join(' · ')
      ctx.progress?.message(`${label} (${discovery.status.size}/${sources.length})  ${done}`)
    })
    await discovery.ready
    const summary = discoverySummary(sources, discovery.status)
    ctx.progress?.stop(summary)
    if (!ctx.progress) ctx.log.step(summary)
    for (const msg of discovery.errors) ctx.log.error(msg)

    if (options.skills?.length) {
      plan = {
        selection: planFromSkillFilters(groups, options.skills, ctx.catalog),
        fromPicker: false,
        fromManifest: false,
      }
    } else if (useManifest) {
      ctx.log.info(`Using ${MANIFEST_FILE} (run with -i to change the selection)`)
      plan = {
        selection: planFromManifest(groups, ctx.manifest!, ctx.log.warn),
        fromPicker: false,
        fromManifest: true,
      }
    } else {
      plan = { selection: planEverything(groups), fromPicker: false, fromManifest: false }
      const count = [...plan.selection.values()].reduce((n, ids) => n + ids.length, 0)
      if (count > 10 && !options.dryRun) {
        ctx.log.warn(
          `Installing all ${count} skills from ${plan.selection.size} sources. ` +
            `Use -s or a ${MANIFEST_FILE} to narrow this down.`,
        )
      }
    }
  }

  for (const [key, ids] of Array.from(plan.selection)) if (!ids.length) plan.selection.delete(key)
  if (plan.selection.size === 0) {
    ctx.log.info('No skills selected. Nothing to install.')
    return 0
  }

  // 3. Scope and agents: flags > manifest > prompt > defaults
  const manifest = plan.fromManifest ? ctx.manifest : undefined
  const global =
    options.global ??
    (manifest?.scope
      ? manifest.scope === 'global'
      : canAsk
        ? (await ctx.promptScope()) === 'global'
        : false)
  const hasFree = sources.some((s) => s.kind === 'free' && plan.selection.has(s.name))
  let agents = options.agents?.length
    ? options.agents
    : manifest?.agents?.length
      ? manifest.agents
      : undefined
  if (!agents) agents = canAsk && hasFree ? await ctx.promptAgents() : [ALL_AGENTS]

  // 4. Install
  const commands = buildCommands(sources, plan.selection, paidTokens, {
    global,
    agents,
    yes: Boolean(options.yes),
  })

  if (options.dryRun) {
    ctx.log.step('Dry run. Commands that would run:')
    ctx.log.message(commands.map((c) => formatCommand(c.cmd, c.args, c.secrets)).join('\n'))
    return 0
  }

  // Knowing what is already there lets the summary say "new" vs "refreshed".
  const before = ctx.runCaptured ? await installedSkillNames(ctx, global) : undefined
  const outcomes: SourceOutcome[] = []
  for (const command of commands) {
    const selected = plan.selection.get(command.source.name) ?? []
    const outcome: SourceOutcome = {
      name: command.source.name,
      status: 'ok',
      installed: [],
      fresh: [],
      failed: [],
      skipped: [],
    }
    if (command.source.kind === 'free' && ctx.runCaptured) {
      // Quiet install: the skills CLI prints one JSON array; we render the result.
      const label = `Installing ${command.source.name} (${selected.length} skill${selected.length === 1 ? '' : 's'})`
      ctx.progress?.start(label)
      const out = await ctx.runCaptured(command.cmd, [...command.args, '--json'])
      const results = parseAddResults(out.stdout)
      if (!results) {
        outcome.status = out.code === 0 ? 'ok' : 'failed'
        if (out.code === 0) outcome.installed = selected
        else outcome.failed = selected.map((name) => ({ name, error: 'installer failed' }))
      } else {
        for (const r of results) {
          const name = r.name ?? '?'
          if (r.status === 'installed') outcome.installed.push(name)
          else if (r.status === 'skipped')
            outcome.skipped.push({ name, reason: r.reason ?? 'skipped' })
          else outcome.failed.push({ name, error: r.error ?? 'failed' })
        }
        if (outcome.failed.length || (out.code !== 0 && !outcome.installed.length)) {
          outcome.status = 'failed'
        }
      }
      outcome.fresh = before ? outcome.installed.filter((n) => !before.has(n)) : []
      ctx.progress?.stop(formatOutcome(outcome))
      if (!ctx.progress) ctx.log.message(formatOutcome(outcome))
      if (outcome.status === 'failed' && out.stderr.trim()) ctx.log.message(tail(out.stderr))
    } else {
      // Paid installers may prompt, so they keep the terminal.
      ctx.log.step(command.source.name)
      const code = await ctx.run(command.cmd, command.args)
      outcome.status = code === 0 ? 'ok' : 'failed'
      if (code === 0) outcome.installed = selected
      else outcome.failed = selected.map((name) => ({ name, error: 'installer failed' }))
      outcome.fresh = before ? outcome.installed.filter((n) => !before.has(n)) : []
      ctx.log.message(formatOutcome(outcome))
    }
    outcomes.push(outcome)
  }

  const failed = outcomes.some((o) => o.status === 'failed')
  if (failed) {
    ctx.log.error(
      `${outcomes
        .filter((o) => o.status === 'failed')
        .map((o) => o.name)
        .join(', ')} did not install. ` +
        'Everything else is in place; rerun to retry the failed source.',
    )
    return 1
  }
  const freshCount = before ? outcomes.reduce((n, o) => n + o.fresh.length, 0) : undefined
  const refreshedCount = before
    ? outcomes.reduce((n, o) => n + o.installed.length - o.fresh.length, 0)
    : undefined

  // 5. Persist what the user chose, so the next run (or the next teammate) skips the picker.
  // Cancelling here must not turn a finished install into exit 130.
  let manifestSaved = false
  try {
    manifestSaved = await persist(ctx, plan, { global, agents }, paidTokens)
  } catch (err: unknown) {
    if (!(err instanceof CancelledError)) throw err
  }
  // Remember the answers to the prompts so the next run can offer them as defaults.
  if (canAsk && ctx.saveDefaults) {
    try {
      await ctx.saveDefaults({ scope: global ? 'global' : 'project', agents })
    } catch {
      // A failed convenience write must not fail the install.
    }
  }

  const steps = nextSteps({
    global,
    agents,
    selection: plan.selection,
    manifestSaved,
    fresh: freshCount,
    refreshed: refreshedCount,
  })
  if (ctx.log.note) ctx.log.note(steps, 'Next steps')
  else ctx.log.message(steps)
  return 0
}

/** Returns whether the manifest was written. */
async function persist(
  ctx: WorkflowContext,
  plan: Plan,
  scope: { global: boolean; agents: string[] },
  paidTokens: Map<string, ResolvedToken>,
): Promise<boolean> {
  const { options } = ctx
  const canAsk = ctx.isInteractive && !options.yes

  const manifest: Manifest = {
    scope: scope.global ? 'global' : 'project',
    agents: scope.agents,
    skills: Object.fromEntries(plan.selection),
  }
  let saveManifest = Boolean(options.save)
  if (!saveManifest && canAsk && plan.fromPicker) {
    saveManifest = await ctx.confirm(
      `Save this selection to ${MANIFEST_FILE} so teammates get the same skills?`,
      false,
    )
  }
  if (saveManifest) {
    await ctx.saveManifest(manifest)
    ctx.log.info(`Saved ${MANIFEST_FILE}`)
  }

  // Only tokens the user typed are offered for saving; `--save-tokens` also
  // persists ones given by flag or env. Config tokens are already saved.
  const fresh: Record<string, string> = {}
  for (const source of ctx.catalog.paid) {
    const t = paidTokens.get(source.name)
    if (!t || t.from === 'config') continue
    if (t.from === 'prompt' || options.saveTokens) fresh[source.id] = t.token
  }
  if (Object.keys(fresh).length === 0) return saveManifest
  let saveTokens = Boolean(options.saveTokens)
  if (!saveTokens && canAsk) {
    saveTokens = await ctx.confirm('Remember the token(s) you entered for next time?', true)
  }
  if (saveTokens) {
    await ctx.saveTokens(fresh)
    ctx.log.info('Saved token(s) to the user config')
  }
  return saveManifest
}

/** `list` command: prints every discoverable skill. */
export async function listSkills(ctx: WorkflowContext, format: 'text' | 'json'): Promise<number> {
  const sources = resolveSources(ctx.catalog, ctx.options)
  const { groups } = await discover(ctx, sources)
  if (format === 'json') {
    const out = groups.map((g) => ({
      source: g.id,
      kind: g.kind,
      locked: Boolean(g.locked),
      error: g.error,
      skills: g.skills,
    }))
    ctx.log.message(JSON.stringify(out, null, 2))
    return 0
  }
  const lines: string[] = []
  for (const g of groups) {
    const tag = g.kind === 'paid' ? ' (paid)' : ''
    if (g.locked) {
      lines.push(`${g.name}${tag}: token required`)
      continue
    }
    if (g.error) {
      lines.push(`${g.name}${tag}: ${g.error}`)
      continue
    }
    lines.push(`${g.name}${tag}`)
    for (const s of g.skills) {
      lines.push(`  ${s.id}${s.description ? `  ${s.description}` : ''}`)
    }
  }
  ctx.log.message(lines.join('\n'))
  return 0
}
