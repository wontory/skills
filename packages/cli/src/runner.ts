import { spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
const quote = (arg: string) => (isWin ? `"${arg.replaceAll('"', '""')}"` : arg)

export function resolveNpx(): string {
  return 'npx'
}

export function runSubprocess(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, isWin ? args.map(quote) : args, {
      stdio: 'inherit',
      shell: isWin,
    })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}
