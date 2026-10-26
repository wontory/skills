/**
 * Agent ids accepted by `npx skills add --agent`, mirrored from vercel-labs/skills.
 * `*` means every agent the installer detects. Unknown ids are passed through with a
 * warning so newer agents keep working before this list is refreshed.
 */
export const AGENTS: { id: string; name: string }[] = [
  { id: 'adal', name: 'AdaL' },
  { id: 'aider-desk', name: 'AiderDesk' },
  { id: 'amp', name: 'Amp' },
  { id: 'antigravity', name: 'Antigravity' },
  { id: 'antigravity-cli', name: 'Antigravity CLI' },
  { id: 'astrbot', name: 'AstrBot' },
  { id: 'augment', name: 'Augment' },
  { id: 'autohand-code', name: 'Autohand Code CLI' },
  { id: 'claude-code', name: 'Claude Code' },
  { id: 'cline', name: 'Cline' },
  { id: 'codestudio', name: 'Code Studio' },
  { id: 'codearts-agent', name: 'CodeArts Agent' },
  { id: 'codebuddy', name: 'CodeBuddy' },
  { id: 'codemaker', name: 'Codemaker' },
  { id: 'codex', name: 'Codex' },
  { id: 'command-code', name: 'Command Code' },
  { id: 'continue', name: 'Continue' },
  { id: 'cortex', name: 'Cortex Code' },
  { id: 'crush', name: 'Crush' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'deepagents', name: 'Deep Agents' },
  { id: 'devin', name: 'Devin for Terminal' },
  { id: 'dexto', name: 'Dexto' },
  { id: 'droid', name: 'Droid' },
  { id: 'eve', name: 'Eve' },
  { id: 'firebender', name: 'Firebender' },
  { id: 'forgecode', name: 'ForgeCode' },
  { id: 'fx', name: 'fx' },
  { id: 'gemini-cli', name: 'Gemini CLI' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
  { id: 'goose', name: 'Goose' },
  { id: 'grok', name: 'Grok Build' },
  { id: 'hermes-agent', name: 'Hermes Agent' },
  { id: 'bob', name: 'IBM Bob' },
  { id: 'iflow-cli', name: 'iFlow CLI' },
  { id: 'inference-sh', name: 'inference.sh' },
  { id: 'jazz', name: 'Jazz' },
  { id: 'junie', name: 'Junie' },
  { id: 'kilo', name: 'Kilo Code' },
  { id: 'kimchi', name: 'Kimchi' },
  { id: 'kimi-code-cli', name: 'Kimi Code CLI' },
  { id: 'kiro-cli', name: 'Kiro CLI' },
  { id: 'kode', name: 'Kode' },
  { id: 'lingma', name: 'Lingma' },
  { id: 'loaf', name: 'Loaf' },
  { id: 'mcpjam', name: 'MCPJam' },
  { id: 'minimax-code', name: 'MiniMax Code' },
  { id: 'mistral-vibe', name: 'Mistral Vibe' },
  { id: 'moxby', name: 'Moxby' },
  { id: 'mux', name: 'Mux' },
  { id: 'neovate', name: 'Neovate' },
  { id: 'ona', name: 'Ona' },
  { id: 'openclaw', name: 'OpenClaw' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'openhands', name: 'OpenHands' },
  { id: 'pi', name: 'Pi' },
  { id: 'pochi', name: 'Pochi' },
  { id: 'posit-assistant', name: 'Posit Assistant' },
  { id: 'promptscript', name: 'PromptScript' },
  { id: 'qoder', name: 'Qoder' },
  { id: 'qoder-cn', name: 'Qoder CN' },
  { id: 'qwen-code', name: 'Qwen Code' },
  { id: 'reasonix', name: 'Reasonix' },
  { id: 'replit', name: 'Replit' },
  { id: 'roo', name: 'Roo Code' },
  { id: 'rovodev', name: 'Rovo Dev' },
  { id: 'sarvam-code', name: 'Sarvam Code' },
  { id: 'tabnine-cli', name: 'Tabnine CLI' },
  { id: 'terramind', name: 'Terramind' },
  { id: 'tinycloud', name: 'Tinycloud' },
  { id: 'trae', name: 'Trae' },
  { id: 'trae-cn', name: 'Trae CN' },
  { id: 'universal', name: 'Universal' },
  { id: 'warp', name: 'Warp' },
  { id: 'windsurf', name: 'Windsurf' },
  { id: 'zcode', name: 'ZCode' },
  { id: 'zed', name: 'Zed' },
  { id: 'zencoder', name: 'Zencoder' },
  { id: 'zenflow', name: 'Zenflow' },
]

/** Shown first in the picker; everything else follows alphabetically. */
export const FEATURED_AGENTS = [
  'claude-code',
  'codex',
  'cursor',
  'gemini-cli',
  'github-copilot',
  'opencode',
  'windsurf',
]

export const ALL_AGENTS = '*'

export const knownAgent = (id: string): boolean =>
  id === ALL_AGENTS || AGENTS.some((a) => a.id === id)

/** Accepts `-a a,b`, `-a a -a b`, and `-a "a b"`. */
export function parseAgents(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const ids = list.flatMap((v) => String(v).split(/[\s,]+/)).filter(Boolean)
  return ids.includes(ALL_AGENTS) ? [ALL_AGENTS] : [...new Set(ids)]
}
