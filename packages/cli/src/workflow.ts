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
  selectSkills: (groups: SkillGroup[]) => Promise<Map<string, string[]>>
  promptToken: (source: PaidSource) => Promise<string | undefined>
  promptRetryOrExclude: (source: PaidSource, error: Error) => Promise<'retry' | 'exclude'>
  discoverFree: (source: FreeSource) => Promise<Skill[]>
  authenticate: (source: PaidSource, token: string, selected: string[]) => Promise<string[]>
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

  // 2. Build selection tree or default non-interactive plan
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
        groups.push({
          id: source.name,
          name: source.name,
          kind: 'paid',
          skills: source.skills,
        })
      }
    }
    selectedMap = await ctx.selectSkills(groups)
  } else {
    selectedMap = new Map<string, string[]>()
    for (const source of FREE_SOURCES) {
      const skills = freeSkillsMap.get(source.name) || []
      if (skills.length > 0) {
        selectedMap.set(
          source.name,
          skills.map((s) => s.id),
        )
      }
    }
    if (!ctx.options.skipPaid) {
      for (const source of PAID_SOURCES) {
        const token = ctx.options[source.option]
        if (token) {
          selectedMap.set(
            source.name,
            source.skills.map((s) => s.id),
          )
        }
      }
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

  // 3. Authenticate paid sources upfront before any installation
  const verifiedPaidIds = new Map<string, string[]>()
  const paidTokens = new Map<string, string>()

  if (!ctx.options.skipPaid) {
    for (const source of PAID_SOURCES) {
      const selected = selectedMap.get(source.name)
      if (!selected || selected.length === 0) continue

      let authenticated = false
      let token = ctx.options[source.option]

      while (!authenticated) {
        if (!token) {
          if (!ctx.isInteractive || ctx.options.yes) {
            selectedMap.delete(source.name)
            break
          }
          const prompted = await ctx.promptToken(source)
          if (!prompted) {
            selectedMap.delete(source.name)
            break
          }
          token = prompted
        }

        try {
          const verifiedIds = await ctx.authenticate(source, token, selected)
          verifiedPaidIds.set(source.name, verifiedIds)
          paidTokens.set(source.name, token)
          authenticated = true
        } catch (err: unknown) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          ctx.log.error(errorObj.message)

          if (!ctx.isInteractive || ctx.options.yes) {
            selectedMap.delete(source.name)
            break
          }

          const choice = await ctx.promptRetryOrExclude(source, errorObj)
          if (choice === 'retry') {
            token = undefined // prompt again
          } else {
            selectedMap.delete(source.name)
            break
          }
        }
      }
    }
  }

  // 4. Install selected sources
  const results: { name: string; status: 'ok' | 'failed' | 'skipped' }[] = []

  for (const source of FREE_SOURCES) {
    const selected = selectedMap.get(source.name)
    if (!selected || selected.length === 0) {
      results.push({ name: source.name, status: 'skipped' })
      continue
    }

    ctx.log.step(source.name)
    const scopeArgs = [
      ...(ctx.options.global ? ['-g'] : []),
      ...(ctx.options.agent
        ? ['-a', ctx.options.agent]
        : ctx.isInteractive && !ctx.options.yes
          ? []
          : ['-a', '*']),
      ...(ctx.options.yes ? ['-y'] : []),
    ]
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
    const verifiedIds = verifiedPaidIds.get(source.name)
    const token = paidTokens.get(source.name)
    if (!verifiedIds || verifiedIds.length === 0 || !token) {
      results.push({ name: source.name, status: 'skipped' })
      continue
    }

    ctx.log.step(source.name)
    const paidArgs = [
      '-y',
      source.installer,
      `--token=${token}`,
      ...(ctx.options.global ? ['-g'] : []),
      ...(ctx.options.yes ? ['-y'] : []),
      ...verifiedIds,
    ]
    const code = await ctx.run(npxCmd, paidArgs)
    results.push({ name: source.name, status: code === 0 ? 'ok' : 'failed' })
  }

  const mark = { ok: '✔', failed: '✖', skipped: '–' }
  const failed = results.some((r) => r.status === 'failed')
  ctx.log.message(results.map((r) => `${mark[r.status]} ${r.name} (${r.status})`).join('\n'))

  return failed ? 1 : 0
}
