import { spawn, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const isWin = process.platform === 'win32'

/**
 * Quotes one argument for cmd.exe. Doubled quotes are the cmd.exe escape.
 * Only used on the Windows fallback path; `%` cannot be escaped reliably on a
 * `cmd /c` command line, so that path refuses arguments containing it.
 */
export function quoteForCmd(arg: string): string {
  if (arg === '') return '""'
  if (/^[\w./:=@+-]+$/.test(arg)) return arg
  return `"${arg.replaceAll('"', '""')}"`
}

export interface Launcher {
  cmd: string
  prefix: string[]
  shell: boolean
}

/**
 * How to run `npx`. On Windows `npx` is a `.cmd` shim that Node refuses to
 * spawn without a shell, so the bundled `npx-cli.js` is run with the current
 * Node binary instead. That avoids cmd.exe quoting entirely. When the script
 * cannot be found (unusual layouts, package managers) the shell fallback is used.
 */
export function resolveNpx(
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  exists: (p: string) => boolean = existsSync,
): Launcher {
  if (platform !== 'win32') return { cmd: 'npx', prefix: [], shell: false }
  const cli = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (exists(cli)) return { cmd: execPath, prefix: [cli], shell: false }
  return { cmd: 'npx', prefix: [], shell: true }
}

/** Resolves the launcher and builds the exact spawn invocation. */
function prepare(
  cmd: string,
  args: string[],
): { file: string; args: string[]; options: SpawnOptions } | { refused: string } {
  const launcher = cmd === 'npx' ? resolveNpx() : { cmd, prefix: [], shell: false }
  if (launcher.shell && args.some((a) => a.includes('%'))) {
    return { refused: 'Refusing to run through cmd.exe with an argument containing "%".' }
  }
  const finalArgs = [...launcher.prefix, ...args]
  if (launcher.shell) {
    return {
      file: [launcher.cmd, ...finalArgs.map(quoteForCmd)].join(' '),
      args: [],
      options: { shell: true },
    }
  }
  return { file: launcher.cmd, args: finalArgs, options: { windowsHide: isWin } }
}

/** Runs a command with the terminal attached (installers that may prompt). */
export function runSubprocess(cmd: string, args: string[]): Promise<number> {
  const plan = prepare(cmd, args)
  if ('refused' in plan) {
    console.error(plan.refused)
    return Promise.resolve(1)
  }
  return new Promise((resolve) => {
    const child = spawn(plan.file, plan.args, { ...plan.options, stdio: 'inherit' })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

export interface Captured {
  code: number
  stdout: string
  stderr: string
}

/** Runs a command silently and returns its output, for commands with machine-readable results. */
export function runCaptured(cmd: string, args: string[]): Promise<Captured> {
  const plan = prepare(cmd, args)
  if ('refused' in plan) return Promise.resolve({ code: 1, stdout: '', stderr: plan.refused })
  return new Promise((resolve) => {
    const child = spawn(plan.file, plan.args, {
      ...plan.options,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

/** Renders a command for `--dry-run` output with secrets masked. */
export function formatCommand(cmd: string, args: string[], secrets: string[] = []): string {
  const shown = args.map((a) => {
    let out = a
    for (const s of secrets) if (s) out = out.replaceAll(s, '********')
    return /[\s"']/.test(out) ? JSON.stringify(out) : out
  })
  return [cmd, ...shown].join(' ')
}
