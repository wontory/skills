import type { Skill } from './selection.ts'

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
  endpoint: string
  skills: Skill[]
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
    skills: [
      { id: 'animate', name: 'animate' },
      { id: 'animation-accessibility', name: 'animation-accessibility' },
      { id: 'animation-performance', name: 'animation-performance' },
      { id: 'animation-vocabulary', name: 'animation-vocabulary' },
      { id: 'css-animations', name: 'css-animations' },
      { id: 'debug-animation', name: 'debug-animation' },
      { id: 'gesture-ui', name: 'gesture-ui' },
      { id: 'motion-brief', name: 'motion-brief' },
      { id: 'motion-react', name: 'motion-react' },
      { id: 'pick-ui-library', name: 'pick-ui-library' },
      { id: 'scroll-animations', name: 'scroll-animations' },
      { id: 'web-animation-design', name: 'web-animation-design' },
      { id: 'find-animation-opportunities', name: 'find-animation-opportunities' },
      { id: 'improve-animations', name: 'improve-animations' },
      { id: 'review-animations', name: 'review-animations' },
    ],
  },
  {
    name: 'aiforui.dev',
    option: 'aiforuiToken',
    installer: '@aiforui/install',
    endpoint: 'https://aiforui.dev/api/install',
    skills: [
      { id: 'emil-design-eng', name: 'emil-design-eng' },
      { id: 'animate', name: 'animate' },
      { id: 'animate-expo', name: 'animate-expo' },
      { id: 'review-animations', name: 'review-animations' },
      { id: 'improve-animations', name: 'improve-animations' },
      { id: 'find-animation-opportunities', name: 'find-animation-opportunities' },
      { id: 'animation-performance', name: 'animation-performance' },
      { id: 'animation-vocabulary', name: 'animation-vocabulary' },
      { id: 'apple-design', name: 'apple-design' },
      { id: 'write-swift', name: 'write-swift' },
      { id: 'pick-ui-library', name: 'pick-ui-library' },
      { id: 'prototype', name: 'prototype' },
      { id: 'mobile-native', name: 'mobile-native' },
      { id: 'break-ui', name: 'break-ui' },
      { id: 'ask-sonner', name: 'ask-sonner' },
    ],
  },
]
