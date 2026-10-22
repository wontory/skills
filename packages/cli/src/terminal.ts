import readline from 'node:readline'
import {
  type Skill,
  type SkillGroup,
  type SelectionState,
  createSelection,
  rows,
  groupStatus,
  selectedSkills,
  move,
  expand,
  toggle,
  unlock,
} from './selection.ts'

const isNoColor = Boolean(process.env.NO_COLOR || !process.stdout.isTTY)

const colors = {
  reset: isNoColor ? '' : '\x1b[0m',
  bold: isNoColor ? '' : '\x1b[1m',
  dim: isNoColor ? '' : '\x1b[2m',
  cyan: isNoColor ? '' : '\x1b[36m',
  green: isNoColor ? '' : '\x1b[32m',
  yellow: isNoColor ? '' : '\x1b[33m',
  red: isNoColor ? '' : '\x1b[31m',
  magenta: isNoColor ? '' : '\x1b[35m',
}

const BANNER_COMPACT = `${colors.bold}${colors.cyan}WONTORY SKILLS${colors.reset}\n`

const BANNER_FULL = `
${colors.bold}${colors.magenta} _       ______  _   ___________  ______  __  __
| |     / / __ \\/ | / /_  __/ __ \\/ __ \\ \\/ / / /
| | /| / / / / /  |/ / / / / / / / /_/ /\\  / / / 
| |/ |/ / /_/ / /|  / / / / /_/ / _, _/ / / /_/  
|__/|__/\\____/_/ |_/ /_/  \\____/_/ |_| /_/ (_)   ${colors.reset}
`

function renderBanner(width: number): string {
  if (width < 60) return BANNER_COMPACT
  return BANNER_FULL
}

export function renderTree(state: SelectionState, width = 80, height = 24): string {
  const allRows = rows(state)
  const header = renderBanner(width)
  const helpText = `${colors.dim}↑/↓ navigate • space toggle • ←/→ expand/collapse • enter confirm • ctrl+c cancel${colors.reset}`

  // Calculate viewport budget
  const headerLines = header.split('\n').length
  const reservedLines = headerLines + 4 // header + help + padding
  const viewHeight = Math.max(5, height - reservedLines)

  let start = 0
  let end = allRows.length
  if (allRows.length > viewHeight) {
    const half = Math.floor(viewHeight / 2)
    start = Math.max(0, Math.min(allRows.length - viewHeight, state.cursor - half))
    end = start + viewHeight
  }

  const lines: string[] = [header]

  for (let i = start; i < end; i++) {
    const row = allRows[i]
    if (!row) continue
    const isCurrent = i === state.cursor
    const pointer = isCurrent ? `${colors.cyan}>${colors.reset} ` : '  '

    if (row.type === 'group') {
      const status = groupStatus(state, row.group.id)
      const icon =
        status === 'all'
          ? `${colors.green}[x]${colors.reset}`
          : status === 'partial'
            ? `${colors.yellow}[-]${colors.reset}`
            : '[ ]'
      const isExpanded = state.expanded.has(row.group.id)
      const arrow = isExpanded ? '▼' : '▶'
      const tag = row.group.kind === 'paid' ? ` ${colors.yellow}(paid)${colors.reset}` : ''
      const name = isCurrent ? `${colors.bold}${row.group.name}${colors.reset}` : row.group.name
      lines.push(`${pointer}${arrow} ${icon} ${name}${tag}`)
    } else if (row.type === 'token') {
      const id = row.group.id
      const typed = '*'.repeat(state.input.get(id)?.length ?? 0)
      const body = state.busy.has(id)
        ? `${colors.dim}verifying...${colors.reset}`
        : `${typed}${isCurrent ? `${colors.cyan}_${colors.reset}` : ''}`
      lines.push(`${pointer}    token: ${body}`)
      const error = state.errors.get(id)
      if (error) lines.push(`      ${colors.red}${error}${colors.reset}`)
      else if (!typed && !state.busy.has(id)) {
        lines.push(`      ${colors.dim}type your token, then press enter${colors.reset}`)
      }
    } else if (row.type === 'skill') {
      const set = state.selected.get(row.group.id)
      const isSelected = Boolean(set?.has(row.skill.id))
      const icon = isSelected ? `${colors.green}[x]${colors.reset}` : '[ ]'
      const name = isCurrent ? `${colors.bold}${row.skill.name}${colors.reset}` : row.skill.name
      lines.push(`${pointer}    ${icon} ${name}`)
    }
  }

  if (allRows.length > viewHeight) {
    lines.push(`${colors.dim}  ... (${start + 1}-${end} of ${allRows.length}) ...${colors.reset}`)
  }

  lines.push('', helpText)
  return lines.join('\n')
}

export function selectSkills(
  groups: SkillGroup[],
  loadCatalog: (groupId: string, token: string) => Promise<Skill[]>,
): Promise<Map<string, string[]>> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const state = createSelection(groups)
    return Promise.resolve(selectedSkills(state))
  }

  return new Promise((resolve) => {
    const state = createSelection(groups)
    const stdin = process.stdin
    const stdout = process.stdout

    let lastLineCount = 0
    let done = false

    const cleanup = () => {
      done = true
      stdin.removeListener('keypress', onKeyPress)
      if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false)
      }
      stdin.pause()
      stdout.write('\x1b[?25h') // Show cursor
    }

    const draw = () => {
      const width = stdout.columns || 80
      const height = stdout.rows || 24
      const content = renderTree(state, width, height)

      if (lastLineCount > 0) {
        stdout.write(`\x1b[${lastLineCount}A\x1b[0J`)
      }

      stdout.write(content + '\n')
      lastLineCount = content.split('\n').length
    }

    const submitToken = async (groupId: string) => {
      const token = (state.input.get(groupId) ?? '').trim()
      if (!token) return
      state.busy.add(groupId)
      state.errors.delete(groupId)
      draw()
      try {
        const skills = await loadCatalog(groupId, token)
        if (done) return
        unlock(state, groupId, skills)
      } catch (err: unknown) {
        if (done) return
        state.errors.set(groupId, err instanceof Error ? err.message : String(err))
        state.input.set(groupId, '')
      }
      state.busy.delete(groupId)
      draw()
    }

    const onKeyPress = (str: string | undefined, key: readline.Key) => {
      if (!key) return

      if (key.ctrl && key.name === 'c') {
        cleanup()
        stdout.write('\n')
        process.exit(130)
      }

      const current = rows(state)[state.cursor]
      if (current?.type === 'token') {
        const id = current.group.id
        if (state.busy.has(id)) return
        if (key.name === 'return' || key.name === 'enter') {
          void submitToken(id)
          return
        }
        if (key.name === 'backspace') {
          state.input.set(id, (state.input.get(id) ?? '').slice(0, -1))
          draw()
          return
        }
        if (str && /^[ -~]+$/.test(str)) {
          state.input.set(id, (state.input.get(id) ?? '') + str)
          state.errors.delete(id)
          draw()
          return
        }
      }

      if (key.name === 'up') {
        move(state, -1)
        draw()
      } else if (key.name === 'down') {
        move(state, 1)
        draw()
      } else if (key.name === 'space') {
        toggle(state)
        draw()
      } else if (key.name === 'right') {
        expand(state, true)
        draw()
      } else if (key.name === 'left') {
        expand(state, false)
        draw()
      } else if (key.name === 'return' || key.name === 'enter') {
        if (state.busy.size > 0) return
        cleanup()
        stdout.write('\n')
        resolve(selectedSkills(state))
      }
    }

    readline.emitKeypressEvents(stdin)
    stdin.on('keypress', onKeyPress)
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true)
    }
    stdin.resume()
    stdout.write('\x1b[?25l') // Hide cursor
    draw()
  })
}
