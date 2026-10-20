import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NodePlopAPI } from 'plop'

const root = dirname(fileURLToPath(import.meta.url))
const template = join(root, 'templates', 'skill.hbs')
const skillsDir = join(root, '..', '..', 'skills')

export default function (plop: NodePlopAPI) {
  plop.setHelper('title', (name: string) =>
    name
      .split('-')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
  )

  plop.setGenerator('skill', {
    description: 'Create skills/<name>/SKILL.md from the shared template',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Skill name (kebab-case):',
        validate: (name: string) => {
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
            return 'Use lowercase letters, digits, and single hyphens.'
          }
          return existsSync(join(skillsDir, name)) ? `skills/${name} already exists.` : true
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'Trigger description:',
        default: 'Use when <the situation or request that should trigger this skill>.',
      },
      {
        type: 'input',
        name: 'summary',
        message: 'One-sentence summary:',
        default: '<One sentence: what this skill does and what it produces.>',
      },
    ],
    actions: [
      // A formatter can rewrite `{{name}}` into `{ { name } }`, which renders as literal text.
      () => {
        if (!readFileSync(template, 'utf8').startsWith('---\nname: {{name}}\n')) {
          throw new Error('templates/skill.hbs is malformed. Was it reformatted?')
        }
        return 'Template is intact'
      },
      {
        type: 'add',
        path: '../../skills/{{name}}/SKILL.md',
        templateFile: 'templates/skill.hbs',
      },
    ],
  })
}
