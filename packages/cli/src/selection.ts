export interface Skill {
  id: string
  name: string
  description?: string
}

export interface SkillGroup {
  id: string
  name: string
  kind: 'free' | 'paid'
  description?: string
  skills: Skill[]
  /** Paid group whose skills are unknown until a token is verified. */
  locked?: boolean
  /** Where to get a token for a locked group. */
  tokenUrl?: string
  /** Discovery failed; shown instead of an empty list. */
  error?: string
  /** Discovery still running; skills are not known yet. */
  loading?: boolean
}

export type Row =
  | { type: 'group'; group: SkillGroup }
  | { type: 'token'; group: SkillGroup }
  | { type: 'skill'; group: SkillGroup; skill: Skill }
  | { type: 'empty'; group: SkillGroup }

export interface SelectionState {
  groups: SkillGroup[]
  cursor: number
  expanded: Set<string>
  selected: Map<string, Set<string>>
  /** Token text typed so far, per locked group. */
  input: Map<string, string>
  /** Groups whose token is being verified. */
  busy: Set<string>
  errors: Map<string, string>
  /** Substring filter on skill names/descriptions; `undefined` when not filtering. */
  filter?: string
}

export interface CreateSelectionOptions {
  /** Pre-selected skill ids per group id (`['*']` selects all). */
  preselect?: Map<string, string[]>
  /**
   * Select every skill of a paid group that is already verified (token from a
   * flag, env, or config) even when `preselect` does not name it. Defaults to
   * true when no `preselect` map is given, so verified paid sources are not
   * silently left out; a manifest run passes false.
   */
  selectVerifiedPaid?: boolean
}

/**
 * Applies the initial selection rule to one group. Called when the state is
 * created and again when a group finishes loading, so a progressively loaded
 * tree ends up identical to one built from complete data.
 */
export function applyInitialSelection(
  state: SelectionState,
  group: SkillGroup,
  options: CreateSelectionOptions,
): void {
  if (group.loading || group.locked || group.skills.length === 0) return
  const wanted = options.preselect?.get(group.id)
  if (wanted) {
    const ids = wanted.includes('*')
      ? group.skills.map((s) => s.id)
      : group.skills.filter((s) => wanted.includes(s.id)).map((s) => s.id)
    // Groups stay collapsed: the "n/m" count shows what is preselected, and a
    // tree that opens fully expanded is hard to take in.
    if (ids.length > 0) state.selected.set(group.id, new Set(ids))
    return
  }
  const verifiedPaid = options.selectVerifiedPaid ?? !options.preselect
  if (group.kind === 'paid' && verifiedPaid) {
    state.selected.set(group.id, new Set(group.skills.map((s) => s.id)))
  }
}

export function createSelection(
  groups: SkillGroup[],
  options: CreateSelectionOptions = {},
): SelectionState {
  const state: SelectionState = {
    groups,
    cursor: 0,
    expanded: new Set(),
    selected: new Map(),
    input: new Map(),
    busy: new Set(),
    errors: new Map(),
  }
  for (const group of groups) applyInitialSelection(state, group, options)
  return state
}

/** A group that was loading has its data now; select per the initial rule and keep the cursor put. */
export function groupLoaded(
  state: SelectionState,
  groupId: string,
  options: CreateSelectionOptions,
): void {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return
  const before = currentRow(state)
  applyInitialSelection(state, group, options)
  keepCursorOn(state, before)
}

export const anyLoading = (state: SelectionState): boolean => state.groups.some((g) => g.loading)

export function matchesFilter(skill: Skill, filter: string | undefined): boolean {
  if (!filter) return true
  const q = filter.toLowerCase()
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.id.toLowerCase().includes(q) ||
    (skill.description?.toLowerCase().includes(q) ?? false)
  )
}

/** Skills of a group that pass the active filter. */
export function visibleSkills(state: SelectionState, group: SkillGroup): Skill[] {
  return group.skills.filter((s) => matchesFilter(s, state.filter))
}

export function rows(state: SelectionState): Row[] {
  const result: Row[] = []
  const filtering = Boolean(state.filter)
  for (const group of state.groups) {
    const visible = visibleSkills(state, group)
    // While filtering, hide groups with no matches (locked/paid groups stay reachable).
    if (filtering && !group.locked && visible.length === 0) continue
    result.push({ type: 'group', group })
    const open = state.expanded.has(group.id) || (filtering && visible.length > 0)
    if (!open) continue
    if (group.locked) {
      result.push({ type: 'token', group })
    } else if (group.skills.length === 0) {
      result.push({ type: 'empty', group })
    } else {
      for (const skill of visible) result.push({ type: 'skill', group, skill })
    }
  }
  return result
}

export function groupStatus(state: SelectionState, groupId: string): 'none' | 'partial' | 'all' {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group || group.skills.length === 0) return 'none'
  const set = state.selected.get(groupId)
  if (!set || set.size === 0) return 'none'
  if (set.size === group.skills.length) return 'all'
  return 'partial'
}

export function selectedSkills(state: SelectionState): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const group of state.groups) {
    const set = state.selected.get(group.id)
    if (set && set.size > 0) {
      result.set(
        group.id,
        group.skills.filter((s) => set.has(s.id)).map((s) => s.id),
      )
    }
  }
  return result
}

export function selectedCount(state: SelectionState): number {
  let n = 0
  for (const set of state.selected.values()) n += set.size
  return n
}

export function currentRow(state: SelectionState): Row | undefined {
  return rows(state)[state.cursor]
}

function clampCursor(state: SelectionState): void {
  const n = rows(state).length
  state.cursor = n === 0 ? 0 : Math.max(0, Math.min(n - 1, state.cursor))
}

const sameRow = (a: Row, b: Row): boolean =>
  a.type === b.type &&
  a.group.id === b.group.id &&
  (a.type !== 'skill' || b.type !== 'skill' || a.skill.id === b.skill.id)

/**
 * Re-points the cursor at the row it was on before the row list changed. When
 * that row is gone, falls back to its group header, then clamps.
 */
function keepCursorOn(state: SelectionState, before: Row | undefined): void {
  if (!before) return clampCursor(state)
  const r = rows(state)
  let index = r.findIndex((row) => sameRow(row, before))
  if (index === -1)
    index = r.findIndex((row) => row.type === 'group' && row.group.id === before.group.id)
  if (index === -1) return clampCursor(state)
  state.cursor = index
}

export function move(state: SelectionState, delta: number): void {
  const r = rows(state)
  if (r.length === 0) {
    state.cursor = 0
    return
  }
  state.cursor = Math.max(0, Math.min(r.length - 1, state.cursor + delta))
}

/** Moves to a row of a given group, preferring its group row. */
function focusGroup(state: SelectionState, groupId: string): void {
  const index = rows(state).findIndex((r) => r.type === 'group' && r.group.id === groupId)
  if (index !== -1) state.cursor = index
  else clampCursor(state)
}

export function expand(state: SelectionState, open?: boolean): void {
  const row = currentRow(state)
  if (!row) return

  const group = row.group
  const shouldOpen = open ?? !state.expanded.has(group.id)

  if (shouldOpen) {
    state.expanded.add(group.id)
    if (group.locked) {
      const tokenIndex = rows(state).findIndex((r) => r.type === 'token' && r.group.id === group.id)
      if (tokenIndex !== -1) state.cursor = tokenIndex
    }
  } else {
    state.expanded.delete(group.id)
    if (row.type !== 'group') focusGroup(state, group.id)
    else clampCursor(state)
  }
}

function setGroup(state: SelectionState, group: SkillGroup, ids: Iterable<string>): void {
  const set = new Set(ids)
  if (set.size === 0) state.selected.delete(group.id)
  else state.selected.set(group.id, set)
}

export function toggle(state: SelectionState): void {
  const row = currentRow(state)
  if (!row) return
  const group = row.group

  if (row.type === 'token' || row.type === 'empty') return

  if (row.type === 'group') {
    if (group.locked) {
      expand(state, true)
      return
    }
    // While filtering, the group row toggles only the visible skills.
    const target = visibleSkills(state, group)
    const set = state.selected.get(group.id) ?? new Set<string>()
    const allVisibleSelected = target.length > 0 && target.every((s) => set.has(s.id))
    if (allVisibleSelected) {
      for (const s of target) set.delete(s.id)
      setGroup(state, group, set)
    } else if (target.length > 0) {
      for (const s of target) set.add(s.id)
      setGroup(state, group, set)
      state.expanded.add(group.id)
    }
    return
  }

  const set = state.selected.get(group.id) ?? new Set<string>()
  if (set.has(row.skill.id)) set.delete(row.skill.id)
  else set.add(row.skill.id)
  setGroup(state, group, set)
}

/** Selects every visible skill in every unlocked group, or clears all when everything is already selected. */
export function toggleAll(state: SelectionState): void {
  const before = currentRow(state)
  const unlocked = state.groups.filter((g) => !g.locked)
  const targets = unlocked.map((g) => ({ g, skills: visibleSkills(state, g) }))
  const everything = targets.every(({ g, skills }) =>
    skills.every((s) => state.selected.get(g.id)?.has(s.id)),
  )
  for (const { g, skills } of targets) {
    const set = state.selected.get(g.id) ?? new Set<string>()
    for (const s of skills) {
      if (everything) set.delete(s.id)
      else set.add(s.id)
    }
    setGroup(state, g, set)
    if (!everything && skills.length > 0) state.expanded.add(g.id)
  }
  keepCursorOn(state, before)
}

export function setFilter(state: SelectionState, filter: string | undefined): void {
  const before = currentRow(state)
  state.filter = filter && filter.length > 0 ? filter : undefined
  keepCursorOn(state, before)
}

export function unlock(state: SelectionState, groupId: string, skills: Skill[]): void {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return
  group.skills = skills
  group.locked = false
  group.error = undefined
  state.selected.set(groupId, new Set(skills.map((s) => s.id)))
  state.input.delete(groupId)
  state.errors.delete(groupId)
  focusGroup(state, groupId)
}
