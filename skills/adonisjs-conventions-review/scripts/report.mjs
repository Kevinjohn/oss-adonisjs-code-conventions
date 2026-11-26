#!/usr/bin/env node
/**
 * Reads the AdonisJS checklist, prepares a review run and builds its output.
 *
 *   report.mjs list [application|package|frontend|workspace] sections that apply, one per line (the draft on stderr)
 *   report.mjs section <slug>               the section's text, as the checklist has it
 *   report.mjs item <id>                    an item, its cookbook entry and the items they cite
 *   report.mjs prepare <run-dir>            lists the files in scope and runs the mechanical checks
 *   report.mjs build <run-dir> [--previous <findings.json>]
 *
 * `prepare` writes `files.json` and `checks/<section>.json` into the run directory. `build` checks
 * every reviewer record against the checklist, the files in scope and the reviewed files, then
 * writes `findings.json`, `report.md`, `verify.json` and `unclear.md`. It writes nothing when a
 * record is wrong.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECKLIST_PATH = join(REPOSITORY, 'adonisjs/checklist.md');
const COOKBOOK_PATH = join(REPOSITORY, 'adonisjs/cookbook.md');
const TERMINOLOGY_CHECK = join(REPOSITORY, 'scripts/check-terminology.mjs');
const PART_KINDS = { 1: ['application', 'package'], 2: ['application'], 3: ['package'] };
// A separate frontend package is not server code: the checklist covers it in these sections only.
const FRONTEND_SECTIONS = new Set([
  'every-change/vocabulary',
  'every-change/lint-format-and-typescript',
  'applications/the-frontend-api-client',
]);
// A workspace package with no @adonisjs/core that is not the frontend: Vocabulary only, as TOOL-2
// is checked once, at the monorepo root.
const WORKSPACE_SECTIONS = new Set(['every-change/vocabulary']);
const RESULTS = ['pass', 'fail', 'n/a', 'departure', 'unclear'];
const TIERS = ['Law', 'Rule', 'Guideline'];
// Example code and build or tool output are not reviewed unless the run includes them by path.
const EXCLUDED_FOLDERS = new Set([
  'example',
  'examples',
  'build',
  'dist',
  'coverage',
  'tmp',
  'node_modules',
  '.adonisjs',
  '.conventions-review',
]);
const EXAMPLE_FILE = /\.example\.[cm]?[jt]sx?$/;
// Prose is not code: Markdown and HTML are not reviewed, except the root README (PKG-45).
const PROSE_FILE = /\.(?:mdx?|html?)$/i;
// Counts findings with the same item and quote, so each gets a key of its own.
const keysSeen = new Map();
const TEST_FILE = /(?:^|\/)tests?\/|\.(?:spec|test)\.[cm]?[jt]sx?$/;
// A check is run only when it is one read-only command the script knows.
const RUNNABLE = /^(?:grep|ls|check-terminology)\b/;
const MAX_CHECK_LINES = 200;

const slugOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const squash = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const cell = (text) => squash(text).replace(/\|/g, '\\|');
const fileOf = (slug) => `${slug.replace('/', '--')}.json`;

function parseChecklist() {
  const lines = readFileSync(CHECKLIST_PATH, 'utf8').split('\n');
  const draft = lines.find((line) => line.startsWith('Draft '))?.match(/^Draft [^.]+/)?.[0] ?? '';
  const sections = [];
  let part = null;
  let section = null;
  for (const line of lines) {
    const partHeading = line.match(/^# (\d)\. (.+)$/);
    if (partHeading) {
      part = { number: Number(partHeading[1]), slug: slugOf(partHeading[2]) };
      section = null;
      continue;
    }
    if (line.startsWith('# ')) {
      part = null;
      section = null;
      continue;
    }
    if (!part) continue;
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = {
        slug: `${part.slug}/${slugOf(heading[1])}`,
        name: heading[1],
        kinds: [],
        when: '',
        items: [],
        checks: [],
        text: [],
      };
      section.kinds = [
        ...PART_KINDS[part.number],
        ...(FRONTEND_SECTIONS.has(section.slug) ? ['frontend'] : []),
        ...(WORKSPACE_SECTIONS.has(section.slug) ? ['workspace'] : []),
      ];
      sections.push(section);
    }
    if (!section) continue;
    if (line !== '---') section.text.push(line);
    const when = line.match(/^\*When:\* (.+)$/);
    if (when) section.when = when[1];
    const item = line.match(/^- \[ \] \*\*([A-Z]+-\d+)\*\* \((Law|Rule|Guideline)\) (.+)$/);
    if (item) section.items.push({ id: item[1], tier: item[2], text: item[3] });
    else if (line.startsWith('- [ ] ')) section.checks.push(parseCheck(line.slice(6)));
  }
  return { draft, sections };
}

/**
 * A key that survives a file rename: the item and a digest of the quote. A second finding with
 * the same quote gets a counter.
 */
function keyOf(itemId, digest) {
  const base = `${itemId}:${digest.slice(0, 8)}`;
  const count = (keysSeen.get(base) ?? 0) + 1;
  keysSeen.set(base, count);
  return count === 1 ? base : `${base}:${count}`;
}

/** The cookbook's entry for an item: its text up to the next entry, blank line or heading. */
function cookbookEntry(id) {
  const lines = readFileSync(COOKBOOK_PATH, 'utf8').split('\n');
  const start = lines.findIndex((line) => new RegExp(`^(?:- )?\\*\\*${id} \\(`).test(line));
  if (start === -1) return '';
  let end = start + 1;
  while (end < lines.length && lines[end] !== '' && !/^(?:- |#)/.test(lines[end])) end += 1;
  return squash(lines.slice(start, end).join(' '));
}

/** The other items an item's text and cookbook entry cite, in checklist order. */
function citedBy(item, sections) {
  const text = `${item.text} ${cookbookEntry(item.id)}`;
  return sections
    .flatMap((section) => section.items)
    .filter((other) => other.id !== item.id && new RegExp(`\\b${other.id}\\b`).test(text));
}

/** Split a check line into its command, what it expects and the items it supports. */
function parseCheck(text) {
  const command = text.match(/^`([^`]+)`/)?.[1] ?? null;
  const items = text.match(/\(([A-Z]+-\d+(?:, [A-Z]+-\d+)*)\)$/)?.[1].split(', ') ?? [];
  return { text, command, items, expectsNothing: /prints (?:nothing|no )/.test(text) };
}

function fail(messages) {
  console.error(messages.join('\n'));
  process.exit(1);
}

function readJson(path, errors) {
  if (!existsSync(path)) {
    errors.push(`${path}: file is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${path}: not valid JSON (${error.message})`);
    return null;
  }
}

function readRun(runDir) {
  const errors = [];
  const run = readJson(join(runDir, 'run.json'), errors);
  for (const field of ['root', 'kind', 'scope', 'sections']) {
    if (run && run[field] === undefined) errors.push(`run.json: "${field}" is missing`);
  }
  if (run && !['code', 'tests', 'both'].includes(run.scope)) {
    errors.push('run.json: "scope" is code, tests or both');
  }
  if (errors.length > 0) fail(errors);
  if (run.sections === 'all') {
    // A code review has no test file, so the sections about tests have nothing to judge. A test
    // file is covered by the sections of part 1 and the section about tests, and by nothing else.
    run.sections = parseChecklist()
      .sections.filter((section) => section.kinds.includes(run.kind))
      .map((section) => section.slug)
      .filter((slug) => run.scope !== 'code' || !/\/tests$/.test(slug))
      .filter(
        (slug) =>
          run.scope !== 'tests' || /^every-change\/|\/tests(?:-and-release)?$/.test(slug)
      );
  }
  return run;
}

const git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean);

function isExcluded(path, include) {
  if (include.some((entry) => path.startsWith(entry))) return false;
  const folders = path.split('/').slice(0, -1);
  return (
    folders.some((folder) => EXCLUDED_FOLDERS.has(folder)) ||
    EXAMPLE_FILE.test(path) ||
    (PROSE_FILE.test(path) && path !== 'README.md')
  );
}

/** The lines a diff adds or changes, as `[first, last]` ranges for each file. */
function changedRanges(root, base) {
  const changed = {};
  let path = null;
  for (const line of git(root, ['diff', '-U0', '--relative', '--diff-filter=d', `${base}...HEAD`])) {
    const file = line.match(/^\+\+\+ b\/(.+)$/);
    if (file) {
      path = file[1];
      changed[path] = [];
      continue;
    }
    const hunk = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/);
    if (!hunk || !path) continue;
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) changed[path].push([Number(hunk[1]), Number(hunk[1]) + count - 1]);
  }
  return changed;
}

/** List the files a run reviews, and what it leaves out, from the run's own settings. */
function filesInScope(run) {
  const folder = !run.folder || run.folder === '.' ? '' : `${run.folder.replace(/\/$/, '')}/`;
  const include = run.include ?? [];
  const tracked = git(run.root, ['ls-files']);
  const changed = run.diff ? changedRanges(run.root, run.diff) : null;
  const inScope = (path) =>
    run.scope === 'both' || (run.scope === 'tests') === TEST_FILE.test(path);
  const candidates = tracked.filter((path) => path.startsWith(folder) && (!changed || changed[path]));
  const files = candidates.filter((path) => !isExcluded(path, include) && inScope(path));
  return {
    files,
    excluded: candidates.filter((path) => isExcluded(path, include)).length,
    changed: changed && Object.fromEntries(files.map((path) => [path, changed[path]])),
    tracked: new Set(tracked),
  };
}

/** Run one check and keep the lines that are about a file in scope. */
function runCheck(check, run, scope) {
  const base = { check: check.text, command: check.command, items: check.items };
  if (!check.command || !RUNNABLE.test(check.command)) {
    const needsDiff = /^git diff\b/.test(check.command ?? '') && !run.diff;
    const note = needsDiff ? 'needs a diff, and this review has none' : 'not a command the script runs';
    return { ...base, result: 'not run', note, lines: [] };
  }
  const command = check.command.replace(/^check-terminology\b/, `node "${TERMINOLOGY_CHECK}"`);
  const done = spawnSync('bash', ['-c', `${command} 2>&1`], {
    cwd: run.root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    timeout: 60_000,
  });
  if (done.error) return { ...base, result: 'not run', note: done.error.message, lines: [] };
  const inScope = new Set(scope.files);
  const lines = done.stdout.split('\n').filter((line) => {
    if (!squash(line) || /^\d+ rejected synonym|^terminology: /.test(line)) return false;
    const path = line.match(/^([^:\s]+)/)?.[1];
    return !scope.tracked.has(path) || inScope.has(path);
  });
  const result = lines.length === 0 && check.expectsNothing ? 'as stated' : 'output';
  const note = lines.length > MAX_CHECK_LINES ? `first ${MAX_CHECK_LINES} of ${lines.length}` : '';
  return { ...base, result, note, lines: lines.slice(0, MAX_CHECK_LINES) };
}

function prepare(runDir) {
  const run = readRun(runDir);
  const { sections } = parseChecklist();
  const unknown = run.sections.filter((slug) => !sections.some((section) => section.slug === slug));
  if (unknown.length > 0) fail(unknown.map((slug) => `run.json: no section "${slug}"`));
  const scope = filesInScope(run);
  writeFileSync(
    join(runDir, 'files.json'),
    `${JSON.stringify({ files: scope.files, excluded: scope.excluded, changed: scope.changed }, null, 2)}\n`
  );
  mkdirSync(join(runDir, 'checks'), { recursive: true });
  mkdirSync(join(runDir, 'sections'), { recursive: true });
  for (const slug of run.sections) {
    const section = sections.find((candidate) => candidate.slug === slug);
    const results = section.checks.map((check) => runCheck(check, run, scope));
    writeFileSync(join(runDir, 'checks', fileOf(slug)), `${JSON.stringify(results, null, 2)}\n`);
  }
  console.log(
    `${scope.files.length} file(s) in scope, ${scope.excluded} left out by default. ` +
      `Wrote ${join(runDir, 'files.json')} and ${run.sections.length} check file(s).`
  );
}

/**
 * Finds the quoted code in the file and returns the line it starts on, nearest to the line the
 * reviewer gave. Returns null when the first line of the quote is not in the file.
 */
function locate(fileText, code, line) {
  const quoted = code.split('\n').map(squash).filter(Boolean);
  const lines = fileText
    .split('\n')
    .map((text, index) => ({ text: squash(text), number: index + 1 }))
    .filter((entry) => entry.text);
  const hits = [];
  lines.forEach((entry, at) => {
    if (quoted.every((part, offset) => lines[at + offset]?.text.includes(part))) hits.push(entry.number);
  });
  if (hits.length === 0) return null;
  const wanted = Number.isInteger(line) ? line : hits[0];
  return hits.reduce((best, hit) => (Math.abs(hit - wanted) < Math.abs(best - wanted) ? hit : best));
}

function build(runDir, previousPath) {
  const errors = [];
  const { draft, sections } = parseChecklist();
  const run = readRun(runDir);
  const scope = readJson(join(runDir, 'files.json'), errors);
  if (!scope) fail([...errors, 'Run "prepare" before "build".']);
  const inScope = new Set(scope.files);

  const findings = [];
  const rejected = [];
  const toVerify = [];
  const coverage = [];
  for (const slug of run.sections) {
    const section = sections.find((candidate) => candidate.slug === slug);
    if (!section) {
      errors.push(`run.json: no section "${slug}" in the checklist`);
      continue;
    }
    const file = join(runDir, 'sections', fileOf(slug));
    const record = readJson(file, errors);
    const checks = readJson(join(runDir, 'checks', fileOf(slug)), errors);
    if (!record || !checks) continue;
    const say = (message) => errors.push(`${file}: ${message}`);
    if (!squash(record.reviewer)) say('"reviewer" is missing: the name of the agent that wrote this');
    if (record.checks) say('"checks" is not yours to write: the script records the checks');
    const results = new Map((record.items ?? []).map((entry) => [entry.item, entry]));
    const live = new Map();
    const seen = new Set();
    const read = new Set(record.files_read ?? []);
    if (read.size === 0 && (record.items ?? []).some((entry) => entry.result !== 'n/a')) {
      say('"files_read" is empty although an item has a result other than n/a');
    }

    for (const entry of record.unclear ?? []) {
      const item = section.items.find((candidate) => candidate.id === entry.item);
      if (!item) {
        say(`unclear names ${entry.item}, which is not an item of this section`);
        continue;
      }
      if (!squash(entry.question).endsWith('?')) {
        say(`${entry.item}: an unclear case is one question, ending in "?", with no answer proposed`);
      }
      const missing = citedBy(item, sections).filter((cited) => !(entry.read ?? []).includes(cited.id));
      if (!Array.isArray(entry.read) || missing.length > 0) {
        say(
          `${entry.item}: "read" must list the items read before asking` +
            (missing.length > 0 ? `; it cites ${missing.map((cited) => cited.id).join(', ')}` : '') +
            `. Run "item ${entry.item}" to read them`
        );
      }
    }

    for (const finding of record.findings ?? []) {
      const item = section.items.find((candidate) => candidate.id === finding.item);
      if (!item) {
        say(`finding names ${finding.item}, which is not an item of this section`);
        continue;
      }
      const where = `${finding.item} at ${finding.path}`;
      if (!finding.path) say(`${finding.item}: finding has no path`);
      else if (!read.has(finding.path)) say(`${where}: the file is not in "files_read"`);
      if (!squash(finding.sentence) || !squash(item.text).includes(squash(finding.sentence))) {
        say(`${where}: "sentence" is not a quote from the item`);
      }
      let line = null;
      if (squash(finding.code)) {
        const path = resolve(run.root, finding.path ?? '');
        if (!inScope.has(finding.path)) {
          say(`${where}: the file is not in files.json, so it is not in this review`);
        } else if (!existsSync(path)) say(`${where}: the file does not exist under the root`);
        else {
          line = locate(readFileSync(path, 'utf8'), finding.code, finding.line);
          const ranges = scope.changed?.[finding.path];
          if (line === null) say(`${where}: the first line of "code" is not in the file`);
          else if (ranges && !ranges.some(([first, last]) => line >= first && line <= last)) {
            say(`${where}: line ${line} is not a line the diff changed`);
          }
        }
      } else if (!squash(finding.observed)) {
        say(`${where}: a finding with no "code" needs "observed"`);
      }
      // The same sentence of the same item at the same place is one finding, however often it is written.
      const place = [item.id, finding.path, line ?? squash(finding.observed), squash(finding.sentence)].join('|');
      if (seen.has(place)) continue;
      seen.add(place);
      const judged = typeof finding.verified === 'boolean';
      if (judged && (!squash(finding.verifier) || finding.verifier === record.reviewer)) {
        say(`${where}: "verifier" must name an agent other than the reviewer`);
      }
      if (judged && !squash(finding.verify_note)) {
        say(`${where}: a verdict needs "verify_note", the line that says what the code does`);
      }
      const digest = createHash('sha256')
        .update(squash(finding.code) || squash(finding.observed))
        .digest('hex');
      const entry = {
        key: keyOf(item.id, digest),
        item: item.id,
        tier: item.tier.toLowerCase(),
        section: slug,
        path: finding.path,
        line,
        item_text: squash(finding.sentence),
        code: finding.code ?? '',
        observed: squash(finding.observed),
        pattern: `adonisjs/cookbook.md, item ${item.id}`,
        verified: judged ? finding.verified : null,
        verify_note: squash(finding.verify_note),
        departure: finding.departure ?? null,
      };
      if (finding.verified === false) {
        rejected.push(entry);
        continue;
      }
      if (entry.departure === null && entry.verified === null) {
        toVerify.push({
          section_file: file,
          item: item.id,
          item_full_text: item.text,
          sentence: entry.item_text,
          path: entry.path,
          line,
          code: entry.code,
        });
      }
      findings.push(entry);
      live.set(item.id, [...(live.get(item.id) ?? []), entry]);
    }

    for (const entry of record.items ?? []) {
      if (!section.items.some((item) => item.id === entry.item)) {
        say(`${entry.item} is not an item of this section`);
      }
    }
    const rows = [];
    for (const item of section.items) {
      const result = results.get(item.id);
      if (!result) {
        say(`${item.id} has no result`);
        continue;
      }
      if (!RESULTS.includes(result.result)) {
        say(`${item.id}: result must be one of ${RESULTS.join(', ')}`);
        continue;
      }
      const open = (live.get(item.id) ?? []).filter((entry) => entry.departure === null);
      const covered = (live.get(item.id) ?? []).filter((entry) => entry.departure !== null);
      const raised = (record.findings ?? []).filter((finding) => finding.item === item.id).length;
      let outcome = result.result;
      let reason = squash(result.reason);
      if (outcome === 'n/a' && !reason) say(`${item.id}: n/a needs a reason`);
      if (outcome === 'unclear' && !(record.unclear ?? []).some((entry) => entry.item === item.id)) {
        say(`${item.id}: an unclear result needs an unclear case for the item`);
      }
      if (['pass', 'n/a', 'unclear'].includes(outcome) && raised > 0) {
        say(`${item.id}: result is ${outcome} but it has findings`);
      }
      if (item.tier === 'Guideline' && raised > 1) {
        say(`${item.id}: a guideline is noted once; it has ${raised} findings`);
      }
      if (outcome === 'departure' && (covered.length === 0 || open.length > 0)) {
        say(`${item.id}: a departure result needs every finding to carry a departure number`);
      }
      if (outcome === 'fail' && raised === 0) say(`${item.id}: a fail needs at least one finding`);
      const printed = checks
        .filter((check) => check.items.includes(item.id) && check.result === 'output')
        .reduce((count, check) => count + check.lines.length, 0);
      if (outcome === 'pass' && printed > 0 && !reason) {
        say(`${item.id}: it passes while its check printed ${printed} line(s); give the reason`);
      }
      if (outcome === 'fail' && raised > 0 && open.length === 0) {
        outcome = covered.length > 0 ? 'departure' : 'pass';
        reason = covered.length > 0 ? reason : 'every finding was rejected in the second pass';
      }
      if (outcome === 'departure') {
        reason = `departure ${[...new Set(covered.map((entry) => entry.departure))].join(', ')}`;
      }
      rows.push({ item: item.id, tier: item.tier.toLowerCase(), result: outcome, reason });
    }
    coverage.push({
      section: slug,
      reviewer: record.reviewer,
      files_read: (record.files_read ?? []).filter((path) => inScope.has(path)),
      checks: checks.map(({ lines, ...check }) => ({ ...check, printed: lines.length })),
      unclear: record.unclear ?? [],
      items: rows,
    });
  }
  if (errors.length > 0) fail(errors);

  const previous = previousPath ? readJson(previousPath, errors) : null;
  if (errors.length > 0) fail(errors);
  const now = new Set(findings.map((entry) => entry.key));
  const resolved = (previous?.findings ?? []).filter(
    (entry) => !now.has(entry.key) && run.sections.includes(entry.section)
  );

  const open = findings.filter((entry) => entry.departure === null);
  const count = (tier) => open.filter((entry) => entry.tier === tier).length;
  const summary = {
    laws: count('law'),
    rules: count('rule'),
    guidelines: count('guideline'),
    items_failed: new Set(open.map((entry) => entry.item)).size,
    places: new Set(open.map((entry) => `${entry.path}:${entry.line ?? ''}`)).size,
    covered_by_departure: findings.length - open.length,
    rejected: rejected.length,
    not_verified: toVerify.length,
    resolved: resolved.length,
    files_in_scope: scope.files.length,
    files_left_out: scope.excluded,
  };
  const unclear = coverage.flatMap((section) => section.unclear);
  const output = { checklist: draft, run, summary, findings, rejected, resolved, coverage };
  writeFileSync(join(runDir, 'findings.json'), `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.md'), renderReport(output));
  writeOrRemove(join(runDir, 'verify.json'), toVerify, JSON.stringify(toVerify, null, 2));
  writeOrRemove(join(runDir, 'unclear.md'), unclear, renderUnclear(draft, unclear));
  console.log(
    `${summary.laws} law, ${summary.rules} rule, ${summary.guidelines} guideline findings; ` +
      `${summary.not_verified} not verified; ${unclear.length} unclear. ` +
      `Wrote ${join(runDir, 'report.md')}`
  );
}

function writeOrRemove(path, entries, text) {
  if (entries.length > 0) writeFileSync(path, `${text}\n`);
  else rmSync(path, { force: true });
}

/** The body of an issue that proposes the wording changes a review showed are needed. */
function renderUnclear(draft, unclear) {
  const out = [
    `A review against the checklist (${draft}) met cases the wording of these items does not decide.`,
    'Each needs one sentence added to the item, or a decision that the item does not cover the case.',
    '',
  ];
  for (const item of [...new Set(unclear.map((entry) => entry.item))]) {
    out.push(`## ${item}`, '');
    for (const entry of unclear.filter((candidate) => candidate.item === item)) {
      out.push(`- ${squash(entry.question)}${entry.path ? ` (seen in \`${entry.path}\`)` : ''}`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}

function renderReport({ checklist, run, summary, findings, resolved, coverage }) {
  const out = [
    '# AdonisJS conventions review',
    '',
    `- Checklist: ${checklist}`,
    `- Root: \`${run.root}\`${run.commit ? ` at \`${run.commit}\`` : ''}`,
    `- Folder: \`${run.folder ?? '.'}\`, scope: ${run.scope}, kind: ${run.kind}`,
    `- Reviewed: ${run.diff ? `the lines changed against \`${run.diff}\`` : 'every tracked file'}, ` +
      `${summary.files_in_scope} file(s); ${summary.files_left_out} left out by default`,
    `- Departures list: ${run.departures ? `\`${run.departures}\`` : 'none read'}`,
    `- Reviewer model: ${run.model ?? 'not stated'}`,
    `- Findings: ${summary.laws} law, ${summary.rules} rule, ${summary.guidelines} guideline; ` +
      `${summary.covered_by_departure} covered by a departure; ${summary.rejected} rejected in ` +
      `the second pass; ${summary.not_verified} not verified`,
    `- These are ${summary.items_failed} item(s) failing at ${summary.places} place(s). A place two ` +
      `items cover is one finding for each`,
    '- A tier says what a failed item does to a merge. It is not the severity of a defect',
    '',
  ];
  const open = findings.filter((entry) => entry.departure === null);
  for (const tier of TIERS) {
    const rows = open.filter((entry) => entry.tier === tier.toLowerCase());
    if (rows.length === 0) continue;
    out.push(`## ${tier} findings`, '', '| Item | Where | What was found |', '| --- | --- | --- |');
    for (const entry of rows) {
      const where = entry.line ? `${entry.path}:${entry.line}` : entry.path;
      const quote = entry.code.split('\n').find((line) => squash(line));
      const found = [quote ? `\`${cell(quote)}\`` : '', cell(entry.observed)]
        .filter(Boolean)
        .join(' ');
      out.push(
        `| ${entry.item} | \`${where}\` | ${found}${entry.verified === null ? ' (not verified)' : ''} |`
      );
    }
    out.push('');
  }
  if (open.length === 0) out.push('## Findings', '', 'None.', '');
  const covered = findings.filter((entry) => entry.departure !== null);
  if (covered.length > 0) {
    out.push('## Covered by a departure', '', '| Item | Where | Departure |', '| --- | --- | --- |');
    for (const entry of covered) {
      const where = entry.line ? `${entry.path}:${entry.line}` : entry.path;
      out.push(`| ${entry.item} | \`${where}\` | ${entry.departure} |`);
    }
    out.push('');
  }
  if (resolved.length > 0) {
    out.push('## Resolved since the previous run', '');
    for (const entry of resolved) out.push(`- ${entry.item} \`${entry.path}\``);
    out.push('');
  }
  const unclear = coverage.flatMap((section) => section.unclear);
  if (unclear.length > 0) {
    out.push('## Items whose wording did not decide a case', '');
    for (const entry of unclear) {
      out.push(`- ${entry.item} \`${entry.path ?? ''}\`: ${squash(entry.question)}`);
    }
    out.push('');
  }
  out.push('## Coverage', '');
  for (const section of coverage) {
    out.push(`### ${section.section}`, '', `Files read: ${section.files_read.length}`, '');
    for (const check of section.checks) {
      const detail = check.result === 'output' ? `, ${check.printed} line(s)` : '';
      const note = check.note ? ` (${cell(check.note)})` : '';
      out.push(`- Check ${cell(check.check)}: ${check.result}${detail}${note}`);
    }
    if (section.checks.length > 0) out.push('');
    out.push('| Item | Tier | Result | Reason |', '| --- | --- | --- | --- |');
    for (const row of section.items) {
      out.push(`| ${row.item} | ${row.tier} | ${row.result} | ${cell(row.reason)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'list') {
  const { draft, sections } = parseChecklist();
  console.error(draft);
  for (const section of sections) {
    if (args[0] && !section.kinds.includes(args[0])) continue;
    console.log(`${section.slug}\t${section.items.length} items\t${section.when}`);
  }
} else if (command === 'section' && args[0]) {
  const section = parseChecklist().sections.find((candidate) => candidate.slug === args[0]);
  if (!section) fail([`No section "${args[0]}". Run "list" for the slugs.`]);
  console.log(section.text.join('\n').trim());
} else if (command === 'item' && args[0]) {
  const { sections } = parseChecklist();
  const item = sections.flatMap((section) => section.items).find((candidate) => candidate.id === args[0]);
  if (!item) fail([`No item "${args[0]}".`]);
  console.log(`${item.id} (${item.tier}) ${item.text}\n\nCookbook: ${cookbookEntry(item.id) || 'no entry'}`);
  for (const cited of citedBy(item, sections)) {
    console.log(`\nCited: ${cited.id} (${cited.tier}) ${cited.text}`);
  }
} else if (command === 'prepare' && args[0]) {
  prepare(resolve(args[0]));
} else if (command === 'build' && args[0]) {
  const flag = args.indexOf('--previous');
  build(resolve(args[0]), flag === -1 ? null : args[flag + 1]);
} else {
  fail([
    'Usage: report.mjs list [application|package|frontend|workspace] | section <slug> | item <id> | prepare <run-dir> | build <run-dir> [--previous <findings.json>]',
  ]);
}
