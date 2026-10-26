#!/usr/bin/env node
import {
  autocompleteMultiselect,
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  spinner,
} from '@clack/prompts'
import { cac } from 'cac'
import { listSkills, runWorkflow, type WorkflowContext, type WorkflowOptions } from './workflow.ts'
import { BANNER, c, selectSkills } from './terminal.ts'
import { CancelledError } from './errors.ts'
import { discoverFree, fetchPaidCatalog } from './providers.ts'
import { runCaptured, runSubprocess } from './runner.ts'
import { AGENTS, ALL_AGENTS, FEATURED_AGENTS, parseAgents } from './agents.ts'
import { passthroughArgs, splitList, tokenFlagsFromArgv, tokenIdsFromArgv } from './args.ts'
import {
  BUNDLED_CATALOG,
  type Catalog,
  loadRemoteCatalog,
  mergeCatalogs,
  parseCatalog,
  pinBundledEndpoints,
  tokenEnv,
  tokenFlag,
} from './sources.ts'
import { type InstallDefaults, loadUserConfig, resolveToken, saveUserConfig } from './config.ts'
import { MANIFEST_FILE, type Manifest, loadManifest, saveManifest } from './manifest.ts'
import pkg from '../package.json' with { type: 'json' }

const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
const userConfig = await loadUserConfig()
const localCatalog = mergeCatalogs(BUNDLED_CATALOG, userConfig.sources)
const REPO_REF = /^[\w.-]+\/[\w.-]+$/

const cli = cac('wontory-skills')
cli
  .option('-g, --global', 'Install globally (user-level)')
  .option('--project', `Install into the current project (overrides a manifest's "global")`)
  .option('-a, --agent <agents>', 'Target agents, comma-separated or repeated (`*` = all)')
  .option('-s, --skill <skills>', 'Only these skills, comma-separated (`name` or `source@name`)')
  .option(
    '--source <sources>',
    'Only these sources (name, owner/repo, or paid id); an unknown owner/repo is added',
  )
  .option(
    '-y, --yes',
    'Never prompt; install everything selectable, skip paid sources without a token',
  )
  .option('-i, --interactive', `Open the picker even when ${MANIFEST_FILE} exists`)
  .option('--skip-paid', 'Ignore paid sources')
  .option('--dry-run', 'Print the install commands without running them')
  .option('--save', `Write the selection to ${MANIFEST_FILE}`)
  .option('--save-tokens', 'Remember paid tokens in the user config')
  .option('--refresh', 'Ignore the discovery cache')
  .option('--no-remote', 'Do not fetch the live source catalog; use the bundled one')
// Token flags: one per known paid source, plus any `--<id>-token` actually on the
// command line (a source that only the live catalog knows about). Everything else
// unknown is rejected by cac, so a typo cannot silently change what runs.
const flagged = new Set<string>()
for (const source of localCatalog.paid) {
  flagged.add(source.id)
  cli.option(`${tokenFlag(source)} <token>`, `Token for ${source.name} (or ${tokenEnv(source)})`)
}
for (const id of tokenIdsFromArgv()) {
  if (!flagged.has(id)) cli.option(`--${id}-token <token>`, `Token for ${id}`)
}

cli
  .command('[...skills]', 'Install skills (default). Positional names act like --skill')
  .action(async (positional: unknown[], options) => {
    process.exitCode = await withContext(options, positional.map(String), (ctx) => runWorkflow(ctx))
  })

cli
  .command('update', `Reinstall the skills listed in ${MANIFEST_FILE} (refreshes the catalog)`)
  .action(async (options) => {
    const manifest = await loadManifest().catch((err: Error) => {
      log.error(err.message)
      return undefined
    })
    if (!manifest) {
      log.error(`No ${MANIFEST_FILE} in this folder. Run with --save first.`)
      process.exitCode = 1
      return
    }
    // The manifest decides everything, so no prompts unless `-i` asks for the picker.
    process.exitCode = await withContext(
      { ...options, refresh: true, yes: options.yes || !options.interactive },
      [],
      (ctx) => runWorkflow(ctx),
    )
  })

cli
  .command('list', 'List every skill the configured sources offer')
  .option('--json', 'Machine-readable output')
  .action(async (options) => {
    process.exitCode = await withContext({ ...options, quiet: true }, [], (ctx) =>
      listSkills(ctx, options.json ? 'json' : 'text'),
    )
  })

cli
  .command('installed', 'Show installed skills (runs `npx skills list`)')
  .allowUnknownOptions()
  .action(async () => {
    process.exitCode = await runSubprocess('npx', ['-y', 'skills', 'list', ...passthroughArgs()])
  })

cli
  .command('remove [...skills]', 'Remove installed skills (runs `npx skills remove`)')
  .alias('rm')
  .allowUnknownOptions()
  .action(async () => {
    process.exitCode = await runSubprocess('npx', ['-y', 'skills', 'remove', ...passthroughArgs()])
  })

cli.help()
cli.version(pkg.version)

// No `process.exit()`: on Windows, Node aborts with a libuv assertion when exiting
// while fetch's keep-alive sockets are open. Setting `exitCode` lets the loop drain.
try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
} catch (err: unknown) {
  if (err instanceof CancelledError) {
    cancel(err.message)
    process.exitCode = 130
  } else {
    log.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------

interface RawOptions extends Record<string, unknown> {
  quiet?: boolean
  refresh?: boolean
  remote?: boolean
  json?: boolean
}

async function withContext(
  raw: RawOptions,
  positional: string[],
  run: (ctx: WorkflowContext) => Promise<number>,
): Promise<number> {
  const quiet = Boolean(raw.quiet) || Boolean(raw.json)
  if (raw.global === true && raw.project === true) {
    log.error('--global and --project cannot be combined')
    return 1
  }
  const options: WorkflowOptions = {
    global: raw.global === true ? true : raw.project === true ? false : undefined,
    agents: parseAgents(raw.agent as string | string[] | undefined),
    yes: Boolean(raw.yes),
    skills: [...splitList(raw.skill), ...positional],
    sources: splitList(raw.source),
    skipPaid: Boolean(raw.skipPaid),
    dryRun: Boolean(raw.dryRun),
    save: Boolean(raw.save),
    saveTokens: Boolean(raw.saveTokens),
    interactive: Boolean(raw.interactive),
  }

  if (!quiet) {
    if (isInteractive && (process.stdout.columns ?? 80) >= 60) {
      process.stdout.write(c.magenta(c.bold(BANNER)) + '\n')
    }
    intro('wontory-skills')
  }

  let manifest: Manifest | undefined
  try {
    manifest = await loadManifest()
  } catch (err: unknown) {
    log.error(err instanceof Error ? err.message : String(err))
    return 1
  }

  // Catalog: bundled < live (endpoints pinned) < user config < ad-hoc owner/repo
  // refs from --source or the manifest.
  let catalog: Catalog = localCatalog
  if (raw.remote !== false) {
    const { catalog: remote, remote: live } = await loadRemoteCatalog()
    if (live) catalog = mergeCatalogs(pinBundledEndpoints(remote), userConfig.sources)
  }
  const refs = [...options.sources!, ...Object.keys(manifest?.skills ?? {})]
  const adHoc = [...new Set(refs.map((r) => r.toLowerCase()))].filter(
    (ref) => REPO_REF.test(ref) && !catalog.free.some((s) => s.repo.toLowerCase() === ref),
  )
  if (adHoc.length) {
    catalog = mergeCatalogs(
      catalog,
      parseCatalog({ free: adHoc.map((repo) => ({ name: repo, repo })) }),
    )
  }

  const tokenFlags = tokenFlagsFromArgv()
  const tokens = new Map<string, { token: string; from: 'flag' | 'env' | 'config' }>()
  for (const source of catalog.paid) {
    const resolved = resolveToken(source, tokenFlags, process.env, userConfig)
    if (resolved) tokens.set(source.id, resolved)
  }

  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const spin = quiet || !isInteractive ? undefined : spinner()
  const ctx: WorkflowContext = {
    options,
    isInteractive,
    catalog,
    manifest,
    tokens,
    defaults: userConfig.defaults,
    selectSkills,
    promptScope: () => promptScope(userConfig.defaults),
    promptAgents: () => promptAgents(userConfig.defaults),
    confirm: async (message, initial = false) => {
      const answer = await confirm({ message, initialValue: initial })
      if (isCancel(answer)) throw new CancelledError()
      return answer
    },
    discoverFree: (source) => discoverFree(source, { githubToken, refresh: Boolean(raw.refresh) }),
    fetchPaidCatalog,
    run: runSubprocess,
    runCaptured,
    saveManifest,
    saveTokens: async (fresh) => {
      userConfig.tokens = { ...userConfig.tokens, ...fresh }
      await saveUserConfig(userConfig)
    },
    saveDefaults: async (defaults) => {
      userConfig.defaults = { ...userConfig.defaults, ...defaults }
      await saveUserConfig(userConfig)
    },
    progress: spin
      ? {
          start: (m) => spin.start(m),
          message: (m) => spin.message(m),
          stop: (m) => spin.stop(m),
        }
      : undefined,
    log: quiet
      ? {
          step: noop,
          info: noop,
          warn: noop,
          error: (m) => console.error(m),
          message: (m) => console.log(m),
        }
      : {
          step: log.step,
          info: log.info,
          warn: log.warn,
          error: log.error,
          message: log.message,
          note: (body, title) => note(body, title),
        },
  }

  const code = await run(ctx)
  if (!quiet) outro(code === 0 ? 'Done' : 'Finished with errors')
  return code
}

function noop(): void {}

async function promptScope(defaults: InstallDefaults): Promise<'project' | 'global'> {
  const last = defaults.scope
  const hint = (scope: 'project' | 'global', text: string) =>
    last === scope ? `${text}, last time` : text
  const choice = await select({
    message: 'Where should the skills be installed?',
    initialValue: last ?? 'project',
    options: [
      { value: 'project', label: 'Project', hint: hint('project', 'current folder') },
      { value: 'global', label: 'Global', hint: hint('global', 'available in every project') },
    ],
  })
  if (isCancel(choice)) throw new CancelledError()
  return choice as 'project' | 'global'
}

async function promptAgents(defaults: InstallDefaults): Promise<string[]> {
  const featured = FEATURED_AGENTS.map((id) => AGENTS.find((a) => a.id === id)).filter(
    (a): a is { id: string; name: string } => Boolean(a),
  )
  const rest = AGENTS.filter((a) => !FEATURED_AGENTS.includes(a.id))
  const last = defaults.agents?.length ? defaults.agents : undefined
  const lastHint = (id: string, text?: string) =>
    last?.includes(id) ? (text ? `${text}, last time` : 'last time') : text
  const choice = await autocompleteMultiselect({
    message: last
      ? 'Which agents should get the skills? (your last answer is preselected; enter to keep it)'
      : 'Which agents should get the skills? (space to toggle, type to search)',
    initialValues: last ?? [ALL_AGENTS],
    options: [
      {
        value: ALL_AGENTS,
        label: 'All detected agents',
        hint: lastHint(ALL_AGENTS, 'recommended'),
      },
      ...featured.map((a) => ({ value: a.id, label: a.name, hint: lastHint(a.id) })),
      ...rest.map((a) => ({ value: a.id, label: a.name, hint: lastHint(a.id, 'other') })),
    ],
    required: true,
  })
  if (isCancel(choice)) throw new CancelledError()
  return choice.includes(ALL_AGENTS) ? [ALL_AGENTS] : choice
}
