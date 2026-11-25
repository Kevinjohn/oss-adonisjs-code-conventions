import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./report.mjs', import.meta.url));
const report = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const SECTION = 'applications/controllers';
const CONTROLLER = 'app/controllers/posts_controller.ts';
const ITEMS = ['CTL-1', 'CTL-2', 'CTL-3', 'CTL-4', 'CTL-5', 'CTL-6', 'CTL-7', 'CTL-8', 'CTL-9', 'CTL-10'];
const SENTENCE = 'An action destructures what it uses from the HTTP context';

/** A scratch application, committed, with a run folder beside it. */
function scratch(run = {}) {
  const root = mkdtempSync(join(tmpdir(), 'review-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(CONTROLLER, 'export default class PostsController {\n  async store(ctx: HttpContext) {\n    return ctx\n  }\n}\n');
  write('examples/app/controllers/demo_controller.ts', '  async store(ctx: HttpContext) {}\n');
  write('build/app/controllers/built_controller.ts', '  async store(ctx: HttpContext) {}\n');
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const runDir = mkdtempSync(join(tmpdir(), 'review-run-'));
  const settings = { root, folder: '.', kind: 'application', scope: 'both', sections: [SECTION], ...run };
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(settings));
  return { root, runDir, write, git, clean: () => [root, runDir].forEach((dir) => rmSync(dir, { recursive: true })) };
}

/** A record that fails CTL-4 on the scratch controller and passes the rest. */
function record(overrides = {}) {
  return {
    reviewer: 'reviewer-a',
    files_read: [CONTROLLER],
    items: ITEMS.map((item) => ({ item, result: item === 'CTL-4' ? 'fail' : 'pass' })),
    findings: [{ item: 'CTL-4', path: CONTROLLER, line: 9, sentence: SENTENCE, code: '  async store(ctx: HttpContext) {' }],
    ...overrides,
  };
}

const writeRecord = (runDir, value) =>
  writeFileSync(join(runDir, 'sections', 'applications--controllers.json'), JSON.stringify(value));
const readOut = (runDir, name) => JSON.parse(readFileSync(join(runDir, name), 'utf8'));

test('prepare leaves example and output folders out, and takes them back by name', () => {
  const run = scratch();
  try {
    assert.equal(report('prepare', run.runDir).status, 0);
    assert.deepEqual(readOut(run.runDir, 'files.json'), { files: [CONTROLLER], excluded: 2, changed: null });
    const [, check] = readOut(run.runDir, 'checks/applications--controllers.json');
    assert.deepEqual(check.items, ['CTL-4']);
    assert.equal(check.result, 'output');
    assert.deepEqual(check.lines, [`${CONTROLLER}:2:  async store(ctx: HttpContext) {`]);
    writeFileSync(join(run.runDir, 'run.json'), JSON.stringify({ ...readOut(run.runDir, 'run.json'), include: ['examples/'] }));
    report('prepare', run.runDir);
    assert.equal(readOut(run.runDir, 'files.json').files.length, 2);
  } finally {
    run.clean();
  }
});

test('build corrects the line, asks for verification and then counts a verified finding', () => {
  const run = scratch();
  try {
    report('prepare', run.runDir);
    writeRecord(run.runDir, record());
    const first = report('build', run.runDir);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /1 law, 0 rule, 0 guideline findings; 1 not verified/);
    const [entry] = readOut(run.runDir, 'verify.json');
    assert.equal(entry.line, 2);
    assert.equal(entry.observed, undefined);
    const verified = record();
    Object.assign(verified.findings[0], { verified: true, verifier: 'verifier-b', verify_note: 'takes ctx whole' });
    writeRecord(run.runDir, verified);
    assert.match(report('build', run.runDir).stdout, /0 not verified/);
    assert.equal(existsSync(join(run.runDir, 'verify.json')), false);
    assert.equal(readOut(run.runDir, 'findings.json').findings[0].line, 2);
  } finally {
    run.clean();
  }
});

test('build refuses records that break a rule of the review', () => {
  const run = scratch();
  const refused = (value, pattern) => {
    writeRecord(run.runDir, value);
    const result = report('build', run.runDir);
    assert.equal(result.status, 1, `expected a refusal matching ${pattern}`);
    assert.match(result.stderr, pattern);
  };
  try {
    report('prepare', run.runDir);
    const finding = record().findings[0];
    refused(record({ reviewer: '' }), /"reviewer" is missing/);
    refused(record({ checks: [] }), /the script records the checks/);
    refused(record({ items: record().items.slice(1) }), /CTL-1 has no result/);
    refused(record({ findings: [] }), /CTL-4: a fail needs at least one finding/);
    refused(record({ findings: [{ ...finding, sentence: 'made up' }] }), /not a quote from the item/);
    refused(record({ findings: [{ ...finding, code: 'not there' }] }), /is not in the file/);
    refused(
      record({ findings: [{ ...finding, path: 'examples/app/controllers/demo_controller.ts' }] }),
      /not in files\.json/
    );
    refused(
      record({ findings: [{ ...finding, verified: true, verifier: 'reviewer-a' }] }),
      /"verifier" must name an agent other than the reviewer/
    );
    refused(
      record({ items: ITEMS.map((item) => ({ item, result: 'pass' })), findings: [] }),
      /CTL-4: it passes while its check printed 1 line/
    );
    const twice = { item: 'CTL-1', path: CONTROLLER, sentence: 'A controller maps HTTP to the application', code: 'return ctx' };
    refused(
      record({
        items: ITEMS.map((item) => ({ item, result: ['CTL-1', 'CTL-4'].includes(item) ? 'fail' : 'pass' })),
        findings: [finding, twice, twice],
      }),
      /CTL-1: a guideline is noted once/
    );
  } finally {
    run.clean();
  }
});

test('with a diff, only changed files are in scope and a finding must be on a changed line', () => {
  const run = scratch({ diff: 'HEAD~1' });
  try {
    run.write('app/controllers/tags_controller.ts', 'export default class TagsController {\n  async store(ctx: HttpContext) {}\n}\n');
    run.git('add', '-A');
    run.git('commit', '-q', '-m', 'second');
    report('prepare', run.runDir);
    const tags = 'app/controllers/tags_controller.ts';
    assert.deepEqual(readOut(run.runDir, 'files.json'), { files: [tags], excluded: 0, changed: { [tags]: [[1, 3]] } });
    writeRecord(run.runDir, record());
    assert.match(report('build', run.runDir).stderr, /not in files\.json/);
    const changed = record();
    changed.findings[0].path = tags;
    writeRecord(run.runDir, changed);
    assert.equal(report('build', run.runDir).status, 0);
  } finally {
    run.clean();
  }
});

test('unclear cases become an issue body and a previous run lists what is resolved', () => {
  const run = scratch();
  try {
    report('prepare', run.runDir);
    writeRecord(run.runDir, record());
    report('build', run.runDir);
    const previous = join(run.runDir, 'previous.json');
    writeFileSync(previous, readFileSync(join(run.runDir, 'findings.json')));
    writeRecord(
      run.runDir,
      record({
        items: ITEMS.map((item) => ({ item, result: 'pass', reason: item === 'CTL-4' ? 'checked by hand' : '' })),
        findings: [],
        unclear: [{ item: 'CTL-7', path: CONTROLLER, question: 'Does this count?', read: [] }],
      })
    );
    const result = report('build', run.runDir, '--previous', previous);
    assert.match(result.stdout, /0 law.*1 unclear/);
    assert.match(readFileSync(join(run.runDir, 'unclear.md'), 'utf8'), /## CTL-7\n\n- Does this count\? \(seen in/);
    assert.equal(readOut(run.runDir, 'findings.json').resolved.length, 1);
  } finally {
    run.clean();
  }
});

test('item prints the cookbook entry and the items cited, and an unclear case must have read them', () => {
  const printed = report('item', 'CTL-8').stdout;
  assert.match(printed, /^CTL-8 \(Law\)/);
  assert.match(printed, /Cookbook: - \*\*CTL-8 \(F\)\*\*/);
  assert.match(printed, /Cited: IMP-6 \(Rule\)/);
  const run = scratch();
  try {
    report('prepare', run.runDir);
    const asked = (unclear) => {
      writeRecord(run.runDir, record({ unclear: [{ item: 'CTL-8', path: CONTROLLER, ...unclear }] }));
      return report('build', run.runDir);
    };
    assert.match(asked({ question: 'Is a singleton a service?', read: [] }).stderr, /it cites IMP-6/);
    assert.match(asked({ question: 'Treat it as injected.', read: ['IMP-6'] }).stderr, /one question, ending in "\?"/);
    assert.equal(asked({ question: 'Is a singleton a service?', read: ['IMP-6'] }).status, 0);
  } finally {
    run.clean();
  }
});
