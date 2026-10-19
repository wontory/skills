#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { cancel, confirm, intro, isCancel, log, outro, password } from '@clack/prompts'
import { cac } from 'cac'
import { FREE_SOURCES, PAID_SOURCES, type PaidSource } from './sources.ts'

const cli = cac('wontory-skills')
cli
  .option('-g, --global', 'Install skills globally (user-level)')
  .option('-a, --agent <agents>', 'Target agents (default: pick interactively, or all with --yes)')
  .option('-y, --yes', 'Never prompt; install all free skills, skip paid skills without a token')
  .option('--skip-paid', 'Skip paid skills entirely')
  .option('--animationsdev-token <token>', 'animations.dev token')
  .option('--aiforui-token <token>', 'aiforui.dev token')
  .help()

const { options } = cli.parse()
if (options.help) process.exit(0)

// cmd.exe needs a shell to run npx.cmd, so quote args ourselves there.
const isWin = process.platform === 'win32'
const quote = (arg: string) => (isWin ? `"${arg.replaceAll('"', '""')}"` : arg)

function run(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['-y', ...args.map(quote)], { stdio: 'inherit', shell: isWin })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

function abortIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Cancelled')
    process.exit(130)
  }
  return value as T
}

/** Decide up front, before anything is installed, whether to install a paid source. */
async function resolveToken(source: PaidSource): Promise<string | undefined> {
  if (options.skipPaid) return undefined
  const flagged: string | undefined = options[source.option]
  if (flagged) return flagged
  if (options.yes || !process.stdin.isTTY) return undefined
  const install = abortIfCancelled<boolean>(
    await confirm({ message: `Install ${source.name} (paid)?`, initialValue: false }),
  )
  if (!install) return undefined
  const token = abortIfCancelled<string>(
    await password({
      message: `${source.name} token`,
      validate: (value) => (value?.trim() ? undefined : 'Token is required'),
    }),
  )
  return token.trim()
}

intro('wontory-skills')

const tokens = new Map<string, string | undefined>()
for (const source of PAID_SOURCES) tokens.set(source.name, await resolveToken(source))

// Interactive: let `skills add` show its own skill/agent pickers. Otherwise install everything.
const interactive = !options.yes && process.stdin.isTTY
const scopeArgs = [
  ...(options.global ? ['-g'] : []),
  ...(options.agent ? ['-a', options.agent] : interactive ? [] : ['-a', '*']),
  ...(interactive ? [] : ['-s', '*', '-y']),
]
const results: { name: string; status: 'ok' | 'failed' | 'skipped' }[] = []

for (const source of FREE_SOURCES) {
  log.step(source.name)
  const code = await run(['skills', 'add', source.repo, ...scopeArgs])
  results.push({ name: source.name, status: code === 0 ? 'ok' : 'failed' })
}

for (const source of PAID_SOURCES) {
  const token = tokens.get(source.name)
  if (!token) {
    log.info(`${source.name} — skipped`)
    results.push({ name: source.name, status: 'skipped' })
    continue
  }
  log.step(source.name)
  const code = await run([source.installer, `--token=${token}`])
  results.push({ name: source.name, status: code === 0 ? 'ok' : 'failed' })
}

const mark = { ok: '✔', failed: '✖', skipped: '–' }
const failed = results.some((r) => r.status === 'failed')
log.message(results.map((r) => `${mark[r.status]} ${r.name} (${r.status})`).join('\n'))
outro(failed ? 'Finished with errors' : 'Done')
process.exit(failed ? 1 : 0)
