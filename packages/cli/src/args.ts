/**
 * Small argv helpers kept out of index.ts so they can be unit-tested. cac/mri
 * coerce values (numbers, repeated flags become arrays), which is wrong for
 * secrets, so token flags are read from the raw argv instead.
 */

const PASSTHROUGH_COMMANDS = new Set(['installed', 'remove', 'rm'])

/** Everything after the passthrough subcommand name, untouched. */
export function passthroughArgs(argv: string[] = process.argv.slice(2)): string[] {
  const i = argv.findIndex((a) => PASSTHROUGH_COMMANDS.has(a))
  return i === -1 ? [] : argv.slice(i + 1)
}

/** Accepts `--flag a,b`, `--flag a --flag b`, and `--flag "a b"`. */
export function splitList(v: unknown): string[] {
  return (Array.isArray(v) ? v : v === undefined ? [] : [v])
    .flatMap((x) => String(x).split(/[\s,]+/))
    .filter(Boolean)
}

/**
 * Reads every `--<id>-token <value>` / `--<id>-token=<value>` from argv as a
 * string, keyed by cac's camelCase option name (`<id>Token`). The last one wins.
 */
export function tokenFlagsFromArgv(argv: string[] = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--') break
    const m = arg.match(/^--([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-token(?:=(.*))?$/)
    if (!m) continue
    const key = `${m[1]!.replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())}Token`
    let value = m[2]
    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) continue
      value = next
      i++
    }
    if (value) out[key] = value
  }
  return out
}

/** Paid ids named by `--<id>-token` flags on the command line, in order of appearance. */
export function tokenIdsFromArgv(argv: string[] = process.argv.slice(2)): string[] {
  const ids: string[] = []
  for (const arg of argv) {
    if (arg === '--') break
    const m = arg.match(/^--([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-token(?:=|$)/)
    if (m && !ids.includes(m[1]!)) ids.push(m[1]!)
  }
  return ids
}
