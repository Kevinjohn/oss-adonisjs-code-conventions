#!/usr/bin/env node
/**
 * Reads the AdonisJS checklist and builds the review output.
 *
 *   report.mjs list [application|package]   sections that apply, one per line
 *   report.mjs section <slug>               the section's text, as the checklist has it
 *   report.mjs build <run-dir> [--previous <findings.json>]
 *
 * `build` checks every reviewer record against the checklist and the reviewed files, then writes
 * `findings.json` and `report.md` into the run directory. It writes nothing when a record is wrong.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECKLIST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../adonisjs/checklist.md'
)
const PART_KINDS = { 1: ['application', 'package'], 2: ['application'], 3: ['package'] }
const RESULTS = ['pass', 'fail', 'n/a', 'departure']
const TIERS = ['Law', 'Rule', 'Guideline']

const slugOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()
const cell = (text) => squash(text).replace(/\|/g, '\\|')

function parseChecklist() {
  const lines = readFileSync(CHECKLIST_PATH, 'utf8').split('\n')
  const draft = lines.find((line) => line.startsWith('Draft '))?.match(/^Draft [^.]+/)?.[0] ?? ''
  const sections = []
  let part = null
  let section = null
  for (const line of lines) {
    const partHeading = line.match(/^# (\d)\. (.+)$/)
    if (partHeading) {
      part = { number: Number(partHeading[1]), slug: slugOf(partHeading[2]) }
      section = null
      continue
    }
    if (line.startsWith('# ')) {
      part = null
      section = null
      continue
    }
    if (!part) continue
    const heading = line.match(/^## (.+)$/)
    if (heading) {
      section = {
        slug: `${part.slug}/${slugOf(heading[1])}`,
        name: heading[1],
        kinds: PART_KINDS[part.number],
        when: '',
        items: [],
        checks: [],
        text: [],
      }
      sections.push(section)
    }
    if (!section) continue
    if (line !== '---') section.text.push(line)
    const when = line.match(/^\*When:\* (.+)$/)
    if (when) section.when = when[1]
    const item = line.match(/^- \[ \] \*\*([A-Z]+-\d+)\*\* \((Law|Rule|Guideline)\) (.+)$/)
    if (item) section.items.push({ id: item[1], tier: item[2], text: item[3] })
    else if (line.startsWith('- [ ] ')) section.checks.push(line.slice(6))
  }
  return { draft, sections }
}

function fail(messages) {
  console.error(messages.join('\n'))
  process.exit(1)
}

function readJson(path, errors) {
  if (!existsSync(path)) {
    errors.push(`${path}: file is missing`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    errors.push(`${path}: not valid JSON (${error.message})`)
    return null
  }
}

/**
 * Finds the quoted code in the file and returns the line it starts on, nearest to the line the
 * reviewer gave. Returns null when the first line of the quote is not in the file.
 */
function locate(fileText, code, line) {
  const first = squash(code.split('\n').find((part) => squash(part)) ?? '')
  const hits = []
  fileText.split('\n').forEach((text, index) => {
    if (squash(text).includes(first)) hits.push(index + 1)
  })
  if (hits.length === 0) return null
  const wanted = Number.isInteger(line) ? line : hits[0]
  return hits.reduce((best, hit) => (Math.abs(hit - wanted) < Math.abs(best - wanted) ? hit : best))
}

function build(runDir, previousPath) {
  const errors = []
  const { draft, sections } = parseChecklist()
  const run = readJson(join(runDir, 'run.json'), errors)
  if (!run) fail(errors)
  for (const field of ['root', 'kind', 'scope', 'sections']) {
    if (run[field] === undefined) errors.push(`run.json: "${field}" is missing`)
  }
  if (errors.length > 0) fail(errors)

  const findings = []
  const rejected = []
  const coverage = []
  for (const slug of run.sections) {
    const section = sections.find((candidate) => candidate.slug === slug)
    if (!section) {
      errors.push(`run.json: no section "${slug}" in the checklist`)
      continue
    }
    const file = join(runDir, 'sections', `${slug.replace('/', '--')}.json`)
    const record = readJson(file, errors)
    if (!record) continue
    const say = (message) => errors.push(`${file}: ${message}`)
    const results = new Map((record.items ?? []).map((entry) => [entry.item, entry]))
    const live = new Map()

    for (const finding of record.findings ?? []) {
      const item = section.items.find((candidate) => candidate.id === finding.item)
      if (!item) {
        say(`finding names ${finding.item}, which is not an item of this section`)
        continue
      }
      const where = `${finding.item} at ${finding.path}`
      if (!finding.path) say(`${finding.item}: finding has no path`)
      if (!squash(finding.sentence) || !squash(item.text).includes(squash(finding.sentence))) {
        say(`${where}: "sentence" is not a quote from the item`)
      }
      let line = null
      if (squash(finding.code)) {
        const path = resolve(run.root, finding.path ?? '')
        if (!existsSync(path)) say(`${where}: the file does not exist under the root`)
        else {
          line = locate(readFileSync(path, 'utf8'), finding.code, finding.line)
          if (line === null) say(`${where}: the first line of "code" is not in the file`)
        }
      } else if (!squash(finding.observed)) {
        say(`${where}: a finding with no "code" needs "observed"`)
      }
      const digest = createHash('sha256')
        .update(squash(finding.code) || squash(finding.observed))
        .digest('hex')
      const entry = {
        key: `${item.id}:${finding.path}:${digest.slice(0, 8)}`,
        item: item.id,
        tier: item.tier.toLowerCase(),
        section: slug,
        path: finding.path,
        line,
        item_text: squash(finding.sentence),
        code: finding.code ?? '',
        observed: squash(finding.observed),
        pattern: `adonisjs/cookbook.md, item ${item.id}`,
        verified: finding.verified ?? null,
        departure: finding.departure ?? null,
      }
      if (finding.verified === false) {
        rejected.push({ ...entry, verify_note: squash(finding.verify_note) })
        continue
      }
      findings.push(entry)
      live.set(item.id, [...(live.get(item.id) ?? []), entry])
    }

    for (const entry of record.items ?? []) {
      if (!section.items.some((item) => item.id === entry.item)) {
        say(`${entry.item} is not an item of this section`)
      }
    }
    const rows = []
    for (const item of section.items) {
      const result = results.get(item.id)
      if (!result) {
        say(`${item.id} has no result`)
        continue
      }
      if (!RESULTS.includes(result.result)) {
        say(`${item.id}: result must be one of ${RESULTS.join(', ')}`)
        continue
      }
      const open = (live.get(item.id) ?? []).filter((entry) => entry.departure === null)
      const covered = (live.get(item.id) ?? []).filter((entry) => entry.departure !== null)
      const raised = (record.findings ?? []).some((finding) => finding.item === item.id)
      let outcome = result.result
      let reason = squash(result.reason)
      if (outcome === 'n/a' && !reason) say(`${item.id}: n/a needs a reason`)
      if ((outcome === 'pass' || outcome === 'n/a') && raised) {
        say(`${item.id}: result is ${outcome} but it has findings`)
      }
      if (outcome === 'departure' && (covered.length === 0 || open.length > 0)) {
        say(`${item.id}: a departure result needs every finding to carry a departure number`)
      }
      if (outcome === 'fail' && !raised) say(`${item.id}: a fail needs at least one finding`)
      if (outcome === 'fail' && raised && open.length === 0) {
        outcome = covered.length > 0 ? 'departure' : 'pass'
        reason = covered.length > 0 ? reason : 'every finding was rejected in the second pass'
      }
      if (outcome === 'departure') {
        reason = `departure ${[...new Set(covered.map((entry) => entry.departure))].join(', ')}`
      }
      rows.push({ item: item.id, tier: item.tier.toLowerCase(), result: outcome, reason })
    }
    coverage.push({
      section: slug,
      files_read: record.files_read ?? [],
      checks: record.checks ?? [],
      unclear: record.unclear ?? [],
      items: rows,
    })
  }
  if (errors.length > 0) fail(errors)

  const previous = previousPath ? readJson(previousPath, errors) : null
  if (errors.length > 0) fail(errors)
  const before = new Map((previous?.findings ?? []).map((entry) => [entry.key, entry]))
  for (const entry of findings) {
    entry.status = previous ? (before.has(entry.key) ? 'open' : 'new') : 'new'
  }
  const now = new Set(findings.map((entry) => entry.key))
  const resolved = [...before.values()].filter(
    (entry) => !now.has(entry.key) && run.sections.includes(entry.section)
  )

  const open = findings.filter((entry) => entry.departure === null)
  const count = (tier) => open.filter((entry) => entry.tier === tier).length
  const summary = {
    laws: count('law'),
    rules: count('rule'),
    guidelines: count('guideline'),
    covered_by_departure: findings.length - open.length,
    rejected: rejected.length,
    not_verified: open.filter((entry) => entry.verified === null).length,
    resolved: resolved.length,
  }
  const output = { checklist: draft, run, summary, findings, rejected, resolved, coverage }
  writeFileSync(join(runDir, 'findings.json'), `${JSON.stringify(output, null, 2)}\n`)
  writeFileSync(join(runDir, 'report.md'), renderReport(output))
  console.log(
    `${summary.laws} law, ${summary.rules} rule, ${summary.guidelines} guideline findings; ` +
      `${summary.not_verified} not verified. Wrote ${join(runDir, 'report.md')}`
  )
}

function renderReport({ checklist, run, summary, findings, resolved, coverage }) {
  const out = [
    '# AdonisJS conventions review',
    '',
    `- Checklist: ${checklist}`,
    `- Root: \`${run.root}\`${run.commit ? ` at \`${run.commit}\`` : ''}`,
    `- Folder: \`${run.folder ?? '.'}\`, scope: ${run.scope}, kind: ${run.kind}`,
    `- Departures list: ${run.departures ? `\`${run.departures}\`` : 'none read'}`,
    `- Reviewer model: ${run.model ?? 'not stated'}`,
    `- Findings: ${summary.laws} law, ${summary.rules} rule, ${summary.guidelines} guideline; ` +
      `${summary.covered_by_departure} covered by a departure; ${summary.rejected} rejected in ` +
      `the second pass; ${summary.not_verified} not verified`,
    '',
  ]
  const open = findings.filter((entry) => entry.departure === null)
  for (const tier of TIERS) {
    const rows = open.filter((entry) => entry.tier === tier.toLowerCase())
    if (rows.length === 0) continue
    out.push(`## ${tier} findings`, '', '| Item | Where | What was found | Status |', '| --- | --- | --- | --- |')
    for (const entry of rows) {
      const where = entry.line ? `${entry.path}:${entry.line}` : entry.path
      const quote = entry.code.split('\n').find((line) => squash(line))
      const found = [quote ? `\`${cell(quote)}\`` : '', cell(entry.observed)].filter(Boolean).join(' ')
      const status = entry.verified === null ? `${entry.status}, not verified` : entry.status
      out.push(`| ${entry.item} | \`${where}\` | ${found} | ${status} |`)
    }
    out.push('')
  }
  if (open.length === 0) out.push('## Findings', '', 'None.', '')
  const covered = findings.filter((entry) => entry.departure !== null)
  if (covered.length > 0) {
    out.push('## Covered by a departure', '', '| Item | Where | Departure |', '| --- | --- | --- |')
    for (const entry of covered) {
      const where = entry.line ? `${entry.path}:${entry.line}` : entry.path
      out.push(`| ${entry.item} | \`${where}\` | ${entry.departure} |`)
    }
    out.push('')
  }
  if (resolved.length > 0) {
    out.push('## Resolved since the previous run', '')
    for (const entry of resolved) out.push(`- ${entry.item} \`${entry.path}\``)
    out.push('')
  }
  const unclear = coverage.flatMap((section) => section.unclear)
  if (unclear.length > 0) {
    out.push('## Items whose wording did not decide a case', '')
    for (const entry of unclear) {
      out.push(`- ${entry.item} \`${entry.path ?? ''}\`: ${squash(entry.question)}`)
    }
    out.push('')
  }
  out.push('## Coverage', '')
  for (const section of coverage) {
    out.push(`### ${section.section}`, '', `Files read: ${section.files_read.length}`, '')
    for (const check of section.checks) {
      out.push(`- Check \`${cell(check.command)}\`: ${check.result}${check.note ? ` (${cell(check.note)})` : ''}`)
    }
    if (section.checks.length > 0) out.push('')
    out.push('| Item | Tier | Result | Reason |', '| --- | --- | --- | --- |')
    for (const row of section.items) {
      out.push(`| ${row.item} | ${row.tier} | ${row.result} | ${cell(row.reason)} |`)
    }
    out.push('')
  }
  return out.join('\n')
}

const [command, ...args] = process.argv.slice(2)
if (command === 'list') {
  const { draft, sections } = parseChecklist()
  console.log(draft)
  for (const section of sections) {
    if (args[0] && !section.kinds.includes(args[0])) continue
    console.log(`${section.slug}\t${section.items.length} items\t${section.when}`)
  }
} else if (command === 'section' && args[0]) {
  const section = parseChecklist().sections.find((candidate) => candidate.slug === args[0])
  if (!section) fail([`No section "${args[0]}". Run "list" for the slugs.`])
  console.log(section.text.join('\n').trim())
} else if (command === 'build' && args[0]) {
  const flag = args.indexOf('--previous')
  build(resolve(args[0]), flag === -1 ? null : args[flag + 1])
} else {
  fail(['Usage: report.mjs list [application|package] | section <slug> | build <run-dir> [--previous <findings.json>]'])
}
