#!/usr/bin/env node
import { cancel, intro, isCancel, log, outro, password, select } from '@clack/prompts'
import { cac } from 'cac'
import { runWorkflow, type WorkflowContext } from './workflow.ts'
import { selectSkills } from './terminal.ts'
import { discoverFree, authenticate } from './providers.ts'
import { runSubprocess } from './runner.ts'
import type { PaidSource } from './sources.ts'

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

const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

intro('wontory-skills')

const ctx: WorkflowContext = {
  options: {
    global: options.global,
    agent: options.agent,
    yes: options.yes,
    skipPaid: options.skipPaid,
    animationsdevToken: options.animationsdevToken,
    aiforuiToken: options.aiforuiToken,
  },
  isInteractive,
  selectSkills,
  promptToken: async (source: PaidSource) => {
    const val = await password({
      message: `${source.name} token`,
      validate: (v) => (v?.trim() ? undefined : 'Token is required'),
    })
    if (isCancel(val)) {
      cancel('Operation cancelled.')
      process.exit(130)
    }
    return val.trim()
  },
  promptRetryOrExclude: async (source: PaidSource, err: Error) => {
    log.error(`[${source.name}] ${err.message}`)
    const choice = await select({
      message: `Authentication failed for ${source.name}. How would you like to proceed?`,
      options: [
        { value: 'retry', label: 'Retry token entry' },
        { value: 'exclude', label: 'Exclude source and continue' },
      ],
    })
    if (isCancel(choice)) {
      cancel('Operation cancelled.')
      process.exit(130)
    }
    return choice as 'retry' | 'exclude'
  },
  discoverFree,
  authenticate,
  run: runSubprocess,
  log,
}

const exitCode = await runWorkflow(ctx)
outro(exitCode === 0 ? 'Done' : 'Finished with errors')
process.exit(exitCode)
