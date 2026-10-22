import readline from 'node:readline'
import {
  type SkillGroup,
  type SelectionState,
  createSelection,
  rows,
  groupStatus,
  selectedSkills,
  move,
  expand,
  toggle,
} from './selection.ts'

const isNoColor = Boolean(process.env.NO_COLOR || !process.stdout.isTTY)

const colors = {
  reset: isNoColor ? '' : '\x1b[0m',
  bold: isNoColor ? '' : '\x1b[1m',
  dim: isNoColor ? '' : '\x1b[2m',
  cyan: isNoColor ? '' : '\x1b[36m',
  green: isNoColor ? '' : '\x1b[32m',
  yellow: isNoColor ? '' : '\x1b[33m',
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
      const tag =
        row.group.kind === 'free'
          ? `${colors.green}(free)${colors.reset}`
          : `${colors.yellow}(paid)${colors.reset}`
      const name = isCurrent ? `${colors.bold}${row.group.name}${colors.reset}` : row.group.name
      lines.push(`${pointer}${arrow} ${icon} ${name} ${tag}`)
    } else if (row.type === 'bulk') {
      const status = groupStatus(state, row.group.id)
      const icon =
        status === 'all'
          ? `${colors.green}[x]${colors.reset}`
          : status === 'partial'
            ? `${colors.yellow}[-]${colors.reset}`
            : '[ ]'
      const label = `${colors.dim}select all / deselect all${colors.reset}`
      lines.push(`${pointer}    ${icon} ${label}`)
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

export function selectSkills(groups: SkillGroup[]): Promise<Map<string, string[]>> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const state = createSelection(groups)
    return Promise.resolve(selectedSkills(state))
  }

  return new Promise((resolve) => {
    const state = createSelection(groups)
    const stdin = process.stdin
    const stdout = process.stdout

    let lastLineCount = 0

    const cleanup = () => {
      stdin.removeListener('keypress', onKeyPress)
      if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false)
      }
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

    const onKeyPress = (_str: string | undefined, key: readline.Key) => {
      if (!key) return

      if (key.ctrl && key.name === 'c') {
        cleanup()
        stdout.write('\n')
        process.exit(130)
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
        cleanup()
        stdout.write('\n')
        resolve(selectedSkills(state))
      }
    }

    readline.emitKeypressEvents(stdin)
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true)
    }
    stdout.write('\x1b[?25l') // Hide cursor
    draw()
  })
}
