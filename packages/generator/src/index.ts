import Handlebars from 'handlebars'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const templatePath = join(import.meta.dir, 'templates', 'skill.hbs')
const skillsDir = join(import.meta.dir, '..', '..', '..', 'skills')
const usage = `Usage: bun run generate:skill <name> [--description <text>] [--summary <text>]

  <name>         kebab-case skill name, e.g. code-explain
  --description  "Use when ..." trigger text for the frontmatter
  --summary      one sentence shown under the title`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    description: { type: 'string', short: 'd' },
    summary: { type: 'string', short: 's' },
    help: { type: 'boolean', short: 'h' },
  },
})

const fail = (message: string): never => {
  console.error(`${message}\n\n${usage}`)
  process.exit(1)
}

if (values.help) {
  console.log(usage)
  process.exit(0)
}

const [name] = positionals
if (!name) fail('Missing skill name.')
if (positionals.length > 1) fail('Expected exactly one skill name.')
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name!)) {
  fail(`Invalid name "${name}". Use lowercase letters, digits, and single hyphens.`)
}

const dir = join(skillsDir, name!)
if (existsSync(dir)) fail(`skills/${name} already exists.`)

const title = name!
  .split('-')
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ')

// Markdown output, so HTML escaping is turned off. Strict mode fails on a missing variable.
const render = Handlebars.compile(await readFile(templatePath, 'utf8'), {
  noEscape: true,
  strict: true,
})

// Hints live here, not in the template: oxfmt parses `<...>` in .hbs files as HTML tags.
const content = render({
  name,
  title,
  description:
    values.description ?? 'Use when <the situation or request that should trigger this skill>.',
  summary: values.summary ?? '<One sentence: what this skill does and what it produces.>',
  firstStep: '<First step. Name the exact command or file when there is one.>',
  nextStep: '<Next step.>',
  lastStep: '<Return the result the user needs, such as a URL or a summary.>',
  mainRule: '<The one rule that must never be broken, and why.>',
  otherRule: '<Another action to avoid.>',
})

// A formatter can silently rewrite `{{name}}` into `{ { name } }`, which renders as literal text.
if (!content.startsWith(`---\nname: ${name}\n`)) {
  fail('The rendered skill is malformed. Check that src/templates/skill.hbs was not reformatted.')
}

await mkdir(dir, { recursive: true })
await writeFile(join(dir, 'SKILL.md'), content)
console.log(`Created skills/${name}/SKILL.md`)
