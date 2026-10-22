/** Public repos installed with `npx skills add <repo>`. */
export interface FreeSource {
  name: string
  repo: string
}

/** Paid skills installed with `npx <installer> --token=<token>`. */
export interface PaidSource {
  name: string
  /** CLI option name as cac exposes it (camelCase of `--<flag>-token`) */
  option: 'animationsdevToken' | 'aiforuiToken'
  installer: string
  /** Returns `{ skills: [{ id, name? }] }` when called with `?token=`. */
  endpoint: string
}

export const FREE_SOURCES: FreeSource[] = [
  { name: 'wontory/skills', repo: 'wontory/skills' },
  { name: 'obra/superpowers', repo: 'obra/superpowers' },
]

export const PAID_SOURCES: PaidSource[] = [
  {
    name: 'animations.dev',
    option: 'animationsdevToken',
    installer: '@animationsdev/install',
    endpoint: 'https://animations.dev/api/install',
  },
  {
    name: 'aiforui.dev',
    option: 'aiforuiToken',
    installer: '@aiforui/install',
    endpoint: 'https://aiforui.dev/api/install',
  },
]
