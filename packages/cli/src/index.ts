#!/usr/bin/env node
import { cancel, intro, isCancel, log, multiselect, outro, select } from '@clack/prompts'
import { cac } from 'cac'
import { runWorkflow, type WorkflowContext } from './workflow.ts'
import { selectSkills } from './terminal.ts'
import { discoverFree, fetchPaidCatalog } from './providers.ts'
import { runSubprocess } from './runner.ts'
import { AGENTS } from './agents.ts'

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
  promptScope: async () => {
    const choice = await select({
      message: 'Where should the skills be installed?',
      options: [
        { value: 'project', label: 'Project', hint: 'current folder' },
        { value: 'global', label: 'Global', hint: 'available in every project' },
      ],
    })
    if (isCancel(choice)) {
      cancel('Operation cancelled.')
      process.exit(130)
    }
    return choice as 'project' | 'global'
  },
  promptAgents: async () => {
    const choice = await multiselect({
      message: 'Which agents should get the skills? (space to toggle)',
      options: [
        { value: '*', label: 'All agents' },
        ...AGENTS.map((a) => ({ value: a.id, label: a.name })),
      ],
      required: true,
    })
    if (isCancel(choice)) {
      cancel('Operation cancelled.')
      process.exit(130)
    }
    return choice.includes('*') ? ['*'] : choice
  },
  discoverFree,
  fetchPaidCatalog,
  run: runSubprocess,
  log,
}

const exitCode = await runWorkflow(ctx)
outro(exitCode === 0 ? 'Done' : 'Finished with errors')
process.exit(exitCode)
