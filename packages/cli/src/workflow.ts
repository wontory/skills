import type { Skill, SkillGroup } from './selection.ts'
import { FREE_SOURCES, PAID_SOURCES, type FreeSource, type PaidSource } from './sources.ts'
import { resolveNpx } from './runner.ts'

export interface WorkflowOptions {
  global?: boolean
  agent?: string
  yes?: boolean
  skipPaid?: boolean
  animationsdevToken?: string
  aiforuiToken?: string
}

export interface WorkflowContext {
  options: WorkflowOptions
  isInteractive: boolean
  selectSkills: (
    groups: SkillGroup[],
    loadCatalog: (groupId: string, token: string) => Promise<Skill[]>,
  ) => Promise<Map<string, string[]>>
  promptScope: () => Promise<'project' | 'global'>
  /** Resolves to agent ids, or `['*']` for all agents. */
  promptAgents: () => Promise<string[]>
  discoverFree: (source: FreeSource) => Promise<Skill[]>
  fetchPaidCatalog: (source: PaidSource, token: string) => Promise<Skill[]>
  run: (cmd: string, args: string[]) => Promise<number>
  log: {
    step: (msg: string) => void
    info: (msg: string) => void
    error: (msg: string) => void
    message: (msg: string) => void
  }
}

export async function runWorkflow(ctx: WorkflowContext): Promise<number> {
  const npxCmd = resolveNpx()

  // 1. Discover free skills
  const freeSkillsMap = new Map<string, Skill[]>()
  for (const source of FREE_SOURCES) {
    try {
      const skills = await ctx.discoverFree(source)
      freeSkillsMap.set(source.name, skills)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.log.error(`Failed to discover skills for ${source.name}: ${msg}`)
      freeSkillsMap.set(source.name, [])
    }
  }

  // 2. Paid sources: tokens passed as flags are verified now; others are entered in the tree
  const paidCatalogs = new Map<string, Skill[]>()
  const paidTokens = new Map<string, string>()
  const loadPaid = async (source: PaidSource, token: string): Promise<Skill[]> => {
    const skills = await ctx.fetchPaidCatalog(source, token)
    paidCatalogs.set(source.name, skills)
    paidTokens.set(source.name, token)
    return skills
  }

  if (!ctx.options.skipPaid) {
    for (const source of PAID_SOURCES) {
      const token = ctx.options[source.option]
      if (!token) continue
      try {
        await loadPaid(source, token)
      } catch (err: unknown) {
        ctx.log.error(err instanceof Error ? err.message : String(err))
      }
    }
  }

  // 3. Build selection tree or default non-interactive plan
  let selectedMap: Map<string, string[]>
  if (ctx.isInteractive && !ctx.options.yes) {
    const groups: SkillGroup[] = []
    for (const source of FREE_SOURCES) {
      groups.push({
        id: source.name,
        name: source.name,
        kind: 'free',
        skills: freeSkillsMap.get(source.name) || [],
      })
    }
    if (!ctx.options.skipPaid) {
      for (const source of PAID_SOURCES) {
        const skills = paidCatalogs.get(source.name)
        groups.push({
          id: source.name,
          name: source.name,
          kind: 'paid',
          skills: skills ?? [],
          locked: !skills,
        })
      }
    }
    selectedMap = await ctx.selectSkills(groups, (id, token) =>
      loadPaid(
        PAID_SOURCES.find((s) => s.name === id)!,
        token,
      ),
    )
  } else {
    selectedMap = new Map<string, string[]>()
    for (const source of FREE_SOURCES) {
      const skills = freeSkillsMap.get(source.name) || []
      selectedMap.set(
        source.name,
        skills.map((s) => s.id),
      )
    }
    for (const [name, skills] of paidCatalogs) {
      selectedMap.set(
        name,
        skills.map((s) => s.id),
      )
    }
  }

  // Filter out any entries with empty arrays
  for (const [key, val] of Array.from(selectedMap.entries())) {
    if (!val || val.length === 0) {
      selectedMap.delete(key)
    }
  }

  if (selectedMap.size === 0) {
    ctx.log.info('No skills selected. Nothing to install.')
    return 0
  }

  // 4. Resolve where to install, asking once for every source
  const canAsk = ctx.isInteractive && !ctx.options.yes
  const isGlobal = ctx.options.global || (canAsk ? (await ctx.promptScope()) === 'global' : false)
  const hasFree = FREE_SOURCES.some((s) => selectedMap.has(s.name))
  let agents = ctx.options.agent?.split(/[\s,]+/).filter(Boolean)
  if (!agents?.length) agents = canAsk && hasFree ? await ctx.promptAgents() : ['*']

  // 5. Install selected sources
  const results: { name: string; status: 'ok' | 'failed' | 'skipped' }[] = []

  for (const source of FREE_SOURCES) {
    const selected = selectedMap.get(source.name)
    if (!selected || selected.length === 0) {
      results.push({ name: source.name, status: 'skipped' })
      continue
    }

    ctx.log.step(source.name)
    const scopeArgs = [...(isGlobal ? ['-g'] : []), '-a', ...agents, '-y']
    const skillArgs = selected.flatMap((s) => ['-s', s])
    const code = await ctx.run(npxCmd, [
      '-y',
      'skills',
      'add',
      source.repo,
      ...skillArgs,
      ...scopeArgs,
    ])
    results.push({ name: source.name, status: code === 0 ? 'ok' : 'failed' })
  }

  for (const source of PAID_SOURCES) {
    const selectedIds = selectedMap.get(source.name)
    const token = paidTokens.get(source.name)
    if (!selectedIds || selectedIds.length === 0 || !token) {
      results.push({ name: source.name, status: 'skipped' })
      continue
    }

    ctx.log.step(source.name)
    const paidArgs = [
      '-y',
      source.installer,
      `--token=${token}`,
      isGlobal ? '-g' : '--project',
      ...(ctx.options.yes ? ['-y'] : []),
      ...selectedIds,
    ]
    const code = await ctx.run(npxCmd, paidArgs)
    results.push({ name: source.name, status: code === 0 ? 'ok' : 'failed' })
  }

  const mark = { ok: '✔', failed: '✖', skipped: '–' }
  const failed = results.some((r) => r.status === 'failed')
  ctx.log.message(results.map((r) => `${mark[r.status]} ${r.name} (${r.status})`).join('\n'))

  return failed ? 1 : 0
}
