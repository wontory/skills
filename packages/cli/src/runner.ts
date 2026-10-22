import { spawn } from 'node:child_process'

export function resolveNpx(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

export function runSubprocess(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
    })
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}
