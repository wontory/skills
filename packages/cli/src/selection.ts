export interface Skill {
  id: string
  name: string
}

export interface SkillGroup {
  id: string
  name: string
  kind: 'free' | 'paid'
  skills: Skill[]
  /** Paid group whose skills are unknown until a token is verified. */
  locked?: boolean
}

export type Row =
  | { type: 'group'; group: SkillGroup }
  | { type: 'token'; group: SkillGroup }
  | { type: 'skill'; group: SkillGroup; skill: Skill }

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
}

export function createSelection(groups: SkillGroup[]): SelectionState {
  // Paid groups that are already verified (token passed as a flag) start fully selected
  const selected = new Map<string, Set<string>>()
  for (const group of groups) {
    if (group.kind === 'paid' && !group.locked && group.skills.length > 0) {
      selected.set(group.id, new Set(group.skills.map((s) => s.id)))
    }
  }
  return {
    groups,
    cursor: 0,
    expanded: new Set(),
    selected,
    input: new Map(),
    busy: new Set(),
    errors: new Map(),
  }
}

export function rows(state: SelectionState): Row[] {
  const result: Row[] = []
  for (const group of state.groups) {
    result.push({ type: 'group', group })
    if (!state.expanded.has(group.id)) continue
    if (group.locked) {
      result.push({ type: 'token', group })
    } else {
      for (const skill of group.skills) {
        result.push({ type: 'skill', group, skill })
      }
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

export function move(state: SelectionState, delta: number): void {
  const r = rows(state)
  if (r.length === 0) {
    state.cursor = 0
    return
  }
  state.cursor = Math.max(0, Math.min(r.length - 1, state.cursor + delta))
}

export function expand(state: SelectionState, open?: boolean): void {
  const currentRows = rows(state)
  const currentRow = currentRows[state.cursor]
  if (!currentRow) return

  const group = currentRow.group
  const shouldOpen = open ?? !state.expanded.has(group.id)

  if (shouldOpen) {
    state.expanded.add(group.id)
    if (group.locked) {
      const tokenIndex = rows(state).findIndex((r) => r.type === 'token' && r.group.id === group.id)
      if (tokenIndex !== -1) state.cursor = tokenIndex
    }
  } else {
    state.expanded.delete(group.id)
    const newRows = rows(state)
    const groupIndex = newRows.findIndex((r) => r.type === 'group' && r.group.id === group.id)
    if (currentRow.type !== 'group' && groupIndex !== -1) {
      state.cursor = groupIndex
    } else {
      state.cursor = Math.max(0, Math.min(newRows.length - 1, state.cursor))
    }
  }
}

export function toggle(state: SelectionState): void {
  const currentRows = rows(state)
  const currentRow = currentRows[state.cursor]
  if (!currentRow) return

  const group = currentRow.group

  if (currentRow.type === 'token') return

  if (currentRow.type === 'group') {
    if (group.locked) {
      expand(state, true)
      return
    }
    const status = groupStatus(state, group.id)
    if (status === 'all' || status === 'partial') {
      state.selected.delete(group.id)
    } else if (group.skills.length > 0) {
      const set = new Set<string>()
      for (const skill of group.skills) set.add(skill.id)
      state.selected.set(group.id, set)
      state.expanded.add(group.id)
    }
    return
  }

  if (currentRow.type === 'skill') {
    const skill = currentRow.skill
    let set = state.selected.get(group.id)
    if (!set) {
      set = new Set()
      state.selected.set(group.id, set)
    }
    if (set.has(skill.id)) {
      set.delete(skill.id)
      if (set.size === 0) {
        state.selected.delete(group.id)
      }
    } else {
      set.add(skill.id)
    }
  }
}

export function unlock(state: SelectionState, groupId: string, skills: Skill[]): void {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return
  group.skills = skills
  group.locked = false
  state.selected.set(groupId, new Set(skills.map((s) => s.id)))
  state.input.delete(groupId)
  state.errors.delete(groupId)
  const index = rows(state).findIndex((r) => r.type === 'group' && r.group.id === groupId)
  if (index !== -1) state.cursor = index
}
