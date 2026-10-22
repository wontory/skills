import type { Skill } from './selection.ts'
import type { FreeSource, PaidSource } from './sources.ts'

export type Fetcher = (input: string | URL | any, init?: any) => Promise<Response>

export function parseSkillName(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  const fm = match[1]!

  if (/internal:\s*true/i.test(fm)) return undefined

  const nameMatch = fm.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|([^\s\r\n]+))/m)
  if (!nameMatch) return undefined
  const rawName = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3]
  if (!rawName) return undefined

  if (!/^[a-zA-Z0-9._-]+$/.test(rawName)) return undefined

  return rawName
}

export async function discoverFree(source: FreeSource, fetcher: Fetcher = fetch): Promise<Skill[]> {
  const repoRes = await fetcher(`https://api.github.com/repos/${source.repo}`)
  if (!repoRes.ok) {
    throw new Error(`Failed to fetch repo info for ${source.name}`)
  }
  const repoData = (await repoRes.json()) as { default_branch?: string }
  const defaultBranch = repoData.default_branch || 'main'

  const treeRes = await fetcher(
    `https://api.github.com/repos/${source.repo}/git/trees/${defaultBranch}?recursive=1`,
  )
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch tree for ${source.name}`)
  }
  const treeData = (await treeRes.json()) as {
    truncated?: boolean
    tree?: Array<{ type: string; path: string }>
  }

  if (treeData.truncated) {
    throw new Error(`GitHub tree response was incomplete (truncated) for ${source.name}`)
  }

  const items = treeData.tree || []
  const skillFiles = items.filter(
    (item) => item.type === 'blob' && /^skills\/[^/]+\/SKILL\.md$/i.test(item.path),
  )

  const skills: Skill[] = []
  for (const file of skillFiles) {
    const rawRes = await fetcher(
      `https://raw.githubusercontent.com/${source.repo}/${defaultBranch}/${file.path}`,
    )
    if (!rawRes.ok) continue
    const text = await rawRes.text()
    const name = parseSkillName(text)
    if (name) {
      skills.push({ id: name, name })
    }
  }

  return skills
}

export async function fetchPaidCatalog(
  source: PaidSource,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<Skill[]> {
  const url = new URL(source.endpoint)
  url.searchParams.set('token', token)

  let res: Response
  try {
    res = await fetcher(url)
  } catch {
    throw new Error(`Unable to reach ${source.name}. Check your connection and try again.`)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Invalid token for ${source.name}`)
    }
    throw new Error(`Unable to reach ${source.name} (HTTP ${res.status})`)
  }

  let data: { skills?: Array<{ id: string; name?: string }> }
  try {
    data = (await res.json()) as { skills?: Array<{ id: string; name?: string }> }
  } catch {
    throw new Error(`Invalid response from ${source.name}`)
  }

  return (data.skills || []).map((s) => ({ id: s.id, name: s.name || s.id }))
}
