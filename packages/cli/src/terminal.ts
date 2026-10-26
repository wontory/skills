import type { Key } from 'node:readline'
import { Prompt } from '@clack/core'
import { CancelledError } from './errors.ts'
import {
  S_BAR,
  S_BAR_END,
  S_CHECKBOX_ACTIVE,
  S_CHECKBOX_INACTIVE,
  S_CHECKBOX_SELECTED,
  S_STEP_ACTIVE,
  S_STEP_CANCEL,
  S_STEP_SUBMIT,
  isCancel,
  unicodeOr,
} from '@clack/prompts'
import {
  type Row,
  type SelectionState,
  type Skill,
  type SkillGroup,
  anyLoading,
  createSelection,
  groupLoaded,
  type CreateSelectionOptions,
  currentRow,
  expand,
  groupStatus,
  move,
  rows,
  selectedCount,
  selectedSkills,
  setFilter,
  toggle,
  toggleAll,
  unlock,
} from './selection.ts'

const isNoColor = (): boolean => Boolean(process.env.NO_COLOR) || !process.stdout.isTTY
const paint = (code: string) => (text: string) =>
  isNoColor() ? text : `\x1b[${code}m${text}\x1b[0m`
export const c = {
  bold: paint('1'),
  dim: paint('2'),
  cyan: paint('36'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  magenta: paint('35'),
  blue: paint('34'),
  gray: paint('90'),
}

export const BANNER = `
 _       ______  _   ___________  ______  __  __
| |     / / __ \\/ | / /_  __/ __ \\/ __ \\ \\/ / / /
| | /| / / / / /  |/ / / / / / / / /_/ /\\  / / /
| |/ |/ / /_/ / /|  / / / / /_/ / _, _/ / / /_/
|__/|__/\\____/_/ |_/ /_/  \\____/_/ |_| /_/ (_)
`

// Small triangles (U+25BE / U+25B8): the large ones (▼ / ▶) include an emoji
// presentation, so many terminals draw ▶ double-width and the icon "jumps".
// U+276F: no emoji presentation, narrow width, present in common monospace fonts.
const POINTER = unicodeOr('❯', '>')
const ARROW_OPEN = unicodeOr('▾', 'v')
const ARROW_CLOSED = unicodeOr('▸', '>')
// Partial selection reuses the "selected" glyph in yellow. ◩ and friends are
// East Asian Ambiguous width, so CJK terminals draw them double-width; the
// "n/m" count next to the name makes partial vs all unambiguous without color.
const PARTIAL = unicodeOr(S_CHECKBOX_SELECTED, '[-]')
const ELLIPSIS = unicodeOr('…', '...')

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
export const plainLength = (s: string): number => s.replace(ANSI, '').length
const isPrintable = (ch: string): boolean =>
  ch.length > 0 && Array.from(ch).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)

/** Joins help segments with bullets, dropping trailing segments that do not fit. */
export function fitHelp(segments: string[], width: number): string {
  let out = ''
  for (const seg of segments) {
    const next = out ? `${out} • ${seg}` : seg
    if (next.length > width) break
    out = next
  }
  return out || fit(segments[0] ?? '', width)
}

/** Truncates plain text so it fits in `width` columns. */
export function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text
  if (width === 1) return ELLIPSIS
  return text.slice(0, width - 1) + ELLIPSIS
}

export interface RenderOptions {
  width?: number
  height?: number
  mode?: 'tree' | 'filter'
  /** The prompt state; affects the header symbol and the submitted summary. */
  promptState?: 'initial' | 'active' | 'submit' | 'cancel' | 'error' | 'validating'
  /** One-line hint shown under the header (e.g. "nothing selected"). */
  notice?: string
}

function checkbox(status: 'none' | 'partial' | 'all', active: boolean): string {
  if (status === 'all') return c.green(S_CHECKBOX_SELECTED)
  if (status === 'partial') return c.yellow(PARTIAL)
  return active ? c.cyan(S_CHECKBOX_ACTIVE) : c.dim(S_CHECKBOX_INACTIVE)
}

function renderRow(state: SelectionState, row: Row, active: boolean, width: number): string[] {
  const indent = '   '
  // The cursor row gets an explicit pointer; bold alone is easy to miss on a selected row.
  const lead = active ? ` ${c.cyan(POINTER)} ` : indent
  if (row.type === 'group') {
    const g = row.group
    const status = groupStatus(state, g.id)
    const open = state.expanded.has(g.id) || (Boolean(state.filter) && !g.locked)
    const arrow = c.dim(open ? ARROW_OPEN : ARROW_CLOSED)
    const box = g.locked ? c.dim(S_CHECKBOX_INACTIVE) : checkbox(status, active)
    const name = active ? c.bold(g.name) : g.name
    // Magenta (the banner color) for "paid" so yellow is left for things that need attention.
    const tag = g.kind === 'paid' ? c.magenta(' paid') : ''
    const count = g.loading
      ? c.dim(` loading${ELLIPSIS}`)
      : g.locked
        ? c.yellow(' token required')
        : g.error
          ? c.red(' unavailable')
          : c.blue(` ${state.selected.get(g.id)?.size ?? 0}/${g.skills.length}`)
    let head = `${arrow} ${box} ${name}${tag}${count}`
    // Narrow terminals: drop the status suffix before letting the name wrap.
    if (plainLength(head) + indent.length > width) head = `${arrow} ${box} ${name}${tag}`
    const used = plainLength(head) + indent.length + 1
    const desc =
      g.description && width - used > 8 ? c.dim(` ${fit(g.description, width - used)}`) : ''
    return [`${lead}${head}${desc}`]
  }

  if (row.type === 'token') {
    const id = row.group.id
    const typed = '*'.repeat(state.input.get(id)?.length ?? 0)
    const body = state.busy.has(id)
      ? c.dim('Verifying' + ELLIPSIS)
      : `${typed}${active ? c.cyan('_') : ''}`
    const lines = [`${lead}    ${c.dim('token:')} ${body}`]
    const error = state.errors.get(id)
    if (error) lines.push(`${indent}    ${c.red(error)}`)
    else if (!typed && !state.busy.has(id)) {
      lines.push(`${indent}    ${c.dim('Paste your token, then press enter')}`)
    }
    if (row.group.tokenUrl && !state.busy.has(id)) {
      lines.push(`${indent}    ${c.dim(`Get one at ${row.group.tokenUrl}`)}`)
    }
    return lines
  }

  if (row.type === 'empty') {
    if (row.group.loading) return [`${lead}    ${c.dim(`Loading${ELLIPSIS}`)}`]
    const msg = row.group.error ?? 'No skills found'
    return [`${lead}    ${c.red(fit(msg, width - 8))}`]
  }

  const set = state.selected.get(row.group.id)
  const selected = Boolean(set?.has(row.skill.id))
  const box = selected
    ? c.green(S_CHECKBOX_SELECTED)
    : active
      ? c.cyan(S_CHECKBOX_ACTIVE)
      : c.dim(S_CHECKBOX_INACTIVE)
  const name = active ? c.bold(row.skill.name) : row.skill.name
  const head = `    ${box} ${name}`
  const used = plainLength(head) + indent.length + 1
  const desc =
    row.skill.description && width - used > 8
      ? c.dim(` ${fit(row.skill.description, width - used)}`)
      : ''
  return [`${lead}${head}${desc}`]
}

/** Pure renderer; the prompt feeds it the live state, tests feed it fixtures. */
export function renderTree(state: SelectionState, opts: RenderOptions = {}): string {
  const width = Math.max(20, opts.width ?? 80)
  const height = Math.max(8, opts.height ?? 24)
  const mode = opts.mode ?? 'tree'
  const promptState = opts.promptState ?? 'active'
  const count = selectedCount(state)
  const title = 'Select skills to install'

  if (promptState === 'submit') {
    return `${c.gray(S_BAR)}\n${c.green(S_STEP_SUBMIT)}  ${title}\n${c.gray(S_BAR)}  ${c.dim(`${count} selected`)}`
  }
  if (promptState === 'cancel') {
    return `${c.gray(S_BAR)}\n${c.red(S_STEP_CANCEL)}  ${title}\n${c.gray(S_BAR)}  ${c.dim('Cancelled')}`
  }

  const allRows = rows(state)
  const bar = c.cyan(S_BAR)
  const header =
    width - 3 >= title.length + 12
      ? `${title} ${c.dim(`${count} selected`)}`
      : fit(`${title} ${count} selected`, width - 3)
  const lines: string[] = [c.gray(S_BAR), `${c.cyan(S_STEP_ACTIVE)}  ${header}`]
  if (opts.notice) lines.push(`${bar}  ${c.yellow(fit(opts.notice, width - 3))}`)

  const filterLine =
    mode === 'filter'
      ? `${bar}  ${c.cyan('/')}${state.filter ?? ''}${c.cyan('_')}`
      : state.filter
        ? `${bar}  ${c.dim('/')}${c.dim(state.filter)} ${c.dim('(/ then backspace to clear)')}`
        : undefined
  if (filterLine) lines.push(filterLine)

  const help = fitHelp(
    mode === 'filter'
      ? ['Type to filter', 'enter done', 'backspace on empty clears']
      : [
          '↑/↓ move',
          'space select',
          '←/→ fold',
          'a all',
          '/ filter',
          'enter confirm',
          'esc cancel',
        ],
    width - 4,
  )
  const reserved = lines.length + 3 // rendered rows go between header and footer; footer = indicators + help
  const viewHeight = Math.max(3, height - reserved)

  // Expand rows into rendered lines so the viewport is measured in lines, not rows.
  const rendered: { lines: string[]; index: number }[] = allRows.map((row, i) => ({
    lines: renderRow(state, row, i === state.cursor, width - 4),
    index: i,
  }))
  const total = rendered.reduce((n, r) => n + r.lines.length, 0)

  let start = 0
  let end = rendered.length
  if (total > viewHeight) {
    // Keep the cursor roughly centered.
    const cursorLineStart = rendered.slice(0, state.cursor).reduce((n, r) => n + r.lines.length, 0)
    let firstLine = Math.max(0, cursorLineStart - Math.floor(viewHeight / 2))
    firstLine = Math.min(firstLine, Math.max(0, total - viewHeight))
    let acc = 0
    start = 0
    while (start < rendered.length && acc + rendered[start]!.lines.length <= firstLine) {
      acc += rendered[start]!.lines.length
      start++
    }
    acc = 0
    end = start
    while (end < rendered.length && acc + rendered[end]!.lines.length <= viewHeight) {
      acc += rendered[end]!.lines.length
      end++
    }
    if (end === start) end = start + 1
  }

  if (allRows.length === 0) {
    lines.push(
      `${bar}  ${c.dim(state.filter ? 'No skills match the filter' : 'No sources available')}`,
    )
  }
  if (start > 0) lines.push(`${bar}  ${c.dim(`${ELLIPSIS} ${start} more above`)}`)
  for (const r of rendered.slice(start, end)) {
    for (const line of r.lines) lines.push(`${bar}${line}`)
  }
  if (end < rendered.length)
    lines.push(`${bar}  ${c.dim(`${ELLIPSIS} ${rendered.length - end} more below`)}`)

  lines.push(`${c.cyan(S_BAR_END)}  ${c.dim(help)}`)
  return lines.join('\n')
}

export interface SelectSkillsOptions extends CreateSelectionOptions {
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
  /** Hint shown until the first keypress (e.g. that a recommended set is preselected). */
  notice?: string
  /**
   * Progressive loading: groups passed with `loading: true` are filled in place
   * by the caller, which then invokes the callback registered here.
   */
  onGroupLoaded?: (cb: (groupId: string) => void) => void
}

type LoadCatalog = (groupId: string, token: string) => Promise<Skill[]>

class TreePrompt extends Prompt<Map<string, string[]>> {
  readonly tree: SelectionState
  mode: 'tree' | 'filter' = 'tree'
  private notice: string | undefined
  /** Set after the first Enter on an empty selection; the second Enter exits. */
  private emptyConfirmed = false
  private readonly load: LoadCatalog
  private readonly out: NodeJS.WriteStream

  constructor(groups: SkillGroup[], load: LoadCatalog, opts: SelectSkillsOptions) {
    const output = opts.output ?? process.stdout
    super(
      {
        input: opts.input,
        output,
        render() {
          return (this as unknown as TreePrompt).frame()
        },
      },
      true,
    )
    this.out = output
    this.load = load
    this.tree = createSelection(groups, opts)
    this.notice = opts.notice
    opts.onGroupLoaded?.((groupId) => {
      if (this.state === 'submit' || this.state === 'cancel') return
      groupLoaded(this.tree, groupId, opts)
      if (this.notice?.startsWith('Still loading')) this.notice = undefined
      this.rerender()
    })
    this.on('cursor', (action) => this.onAction(action))
    this.on('key', (char, key) => {
      // Any key other than Enter dismisses the current hint.
      if (key.name !== 'return' && key.name !== 'enter') {
        this.notice = undefined
        this.emptyConfirmed = false
      }
      this.onKey(char, key)
    })
  }

  private frame(): string {
    return renderTree(this.tree, {
      width: this.out.columns || 80,
      height: this.out.rows || 24,
      mode: this.mode,
      promptState: this.state,
      notice: this.notice,
    })
  }

  /** True while keystrokes should go into a text field (token or filter). */
  private get textMode(): boolean {
    return this.mode === 'filter' || currentRow(this.tree)?.type === 'token'
  }

  private get tokenGroup(): string | undefined {
    const row = currentRow(this.tree)
    return row?.type === 'token' ? row.group.id : undefined
  }

  /** Printable keys outside a text field are commands, so keep them out of the readline buffer. */
  protected override _isActionKey(char: string | undefined, _key: Key): boolean {
    if (char === '\t') return true
    if (!this.textMode) return Boolean(char) && isPrintable(char!)
    return false
  }

  protected override _shouldSubmit(): boolean {
    if (this.tree.busy.size > 0) return false
    if (this.mode === 'filter') {
      this.leaveFilter()
      return false
    }
    const group = this.tokenGroup
    if (group) {
      void this.submitToken(group)
      return false
    }
    // Submitting before every source has loaded would silently drop skills.
    if (anyLoading(this.tree)) {
      const pending = this.tree.groups.filter((g) => g.loading).map((g) => g.name)
      this.notice = `Still loading ${pending.join(', ')}${ELLIPSIS} press enter again once it finishes`
      return false
    }
    // Enter on an empty selection is usually a missed "space"; explain once, then allow exit.
    if (selectedCount(this.tree) === 0 && !this.emptyConfirmed) {
      this.emptyConfirmed = true
      this.notice =
        'Nothing selected: space selects a skill, a selects everything. Enter again to quit.'
      return false
    }
    this.value = selectedSkills(this.tree)
    return true
  }

  /**
   * Leaves filter mode, keeping the filter. The readline buffer held the filter
   * text, so it is cleared and, when the cursor now sits on a token row, that
   * row's partial token is restored into it.
   */
  private leaveFilter() {
    this.mode = 'tree'
    this._clearUserInput()
    const group = this.tokenGroup
    if (group) {
      const saved = this.tree.input.get(group) ?? ''
      if (saved) this._setUserInput(saved, true)
    }
  }

  /** Save or restore the token field when the cursor enters or leaves a token row. */
  private syncText(before: Row | undefined) {
    const after = currentRow(this.tree)
    const leftGroup = before?.type === 'token' ? before.group.id : undefined
    const enteredGroup = after?.type === 'token' ? after.group.id : undefined
    if (leftGroup === enteredGroup) return
    if (leftGroup) {
      // `tree.input` was kept current by onKey; `userInput` may hold readline history by now.
      this._clearUserInput()
    }
    if (enteredGroup) {
      this._clearUserInput()
      const saved = this.tree.input.get(enteredGroup) ?? ''
      if (saved) this._setUserInput(saved, true)
    }
  }

  private onAction(
    action: 'up' | 'down' | 'left' | 'right' | 'space' | 'enter' | 'cancel' | undefined,
  ) {
    if (!action || action === 'cancel' || action === 'enter') return
    if (this.mode === 'filter') {
      if (action === 'up' || action === 'down') this.leaveFilter()
      else return
    }
    const before = currentRow(this.tree)
    const busy = this.tokenGroup ? this.tree.busy.has(this.tokenGroup) : false
    if (busy) return
    // Inside the token field, left/right move readline's text cursor, not the tree.
    if (before?.type === 'token' && action !== 'up' && action !== 'down') return
    if (action === 'up') move(this.tree, -1)
    else if (action === 'down') move(this.tree, 1)
    else if (action === 'right') expand(this.tree, true)
    else if (action === 'left') expand(this.tree, false)
    else if (action === 'space') toggle(this.tree)
    this.syncText(before)
  }

  private onKey(char: string | undefined, key: Key) {
    // Filter mode owns the readline buffer, even when the narrowed list leaves
    // the cursor on a token row. Escape is clack's cancel key, so the filter is
    // cleared with backspace instead.
    if (this.mode === 'filter') {
      // `tree.filter` still holds the value from before this keystroke, so a
      // backspace that empties the field clears the filter and a backspace on
      // an already-empty field leaves filter mode.
      if (key.name === 'backspace' && !this.userInput && !this.tree.filter) {
        this.leaveFilter()
        return
      }
      setFilter(this.tree, this.userInput)
      return
    }

    if (this.tokenGroup) {
      const group = this.tokenGroup
      if (this.tree.busy.has(group)) return
      this.tree.input.set(group, this.userInput)
      if (this.userInput) this.tree.errors.delete(group)
      return
    }

    if (key.ctrl || key.meta) return
    if (char === '/') {
      this.mode = 'filter'
      this._clearUserInput()
      if (this.tree.filter) this._setUserInput(this.tree.filter, true)
    } else if (char === 'a' || char === 'A') toggleAll(this.tree)
    else if (char === 'j') this.onAction('down')
    else if (char === 'k') this.onAction('up')
    else if (char === 'h') this.onAction('left')
    else if (char === 'l') this.onAction('right')
  }

  private async submitToken(group: string) {
    const token = (this.tree.input.get(group) ?? this.userInput).trim()
    if (!token) return
    this.tree.busy.add(group)
    this.tree.errors.delete(group)
    this.rerender()
    try {
      const skills = await this.load(group, token)
      if (this.state === 'submit' || this.state === 'cancel') return
      this._clearUserInput()
      unlock(this.tree, group, skills)
      this.notice = `${group}: ${skills.length} skill${skills.length === 1 ? '' : 's'} unlocked and selected`
    } catch (err: unknown) {
      if (this.state === 'submit' || this.state === 'cancel') return
      this.tree.errors.set(group, err instanceof Error ? err.message : String(err))
      this.tree.input.set(group, '')
      this._clearUserInput()
    } finally {
      this.tree.busy.delete(group)
    }
    this.rerender()
  }

  /** Prompt only repaints on keypress; async work needs a manual repaint. */
  private rerender() {
    // `render` is private in the base class; emitting a no-op key does not reach it.
    ;(this as unknown as { render: () => void }).render()
  }
}

/**
 * Interactive tree picker. Returns the chosen skill ids per group, or the
 * default selection when not attached to a terminal.
 */
export async function selectSkills(
  groups: SkillGroup[],
  loadCatalog: LoadCatalog,
  opts: SelectSkillsOptions = {},
): Promise<Map<string, string[]>> {
  const input = opts.input ?? process.stdin
  const output = opts.output ?? process.stdout
  if (!input.isTTY || !output.isTTY) {
    return selectedSkills(createSelection(groups, opts))
  }

  const prompt = new TreePrompt(groups, loadCatalog, { ...opts, input, output })
  const result = await prompt.prompt()
  if (isCancel(result) || result === undefined) {
    throw new CancelledError()
  }
  return result
}

export { CancelledError }
