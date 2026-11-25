import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createChecker, loadConfig, parseRejectedTerms } from './check-terminology.mjs';

const script = fileURLToPath(new URL('./check-terminology.mjs', import.meta.url));
const term = (rejected, preferred) => ({ rejected, preferred, entry: 'x', source: 'dictionary.md' });
const config = (overrides = {}) => ({
  terms: [
    term('route guard', 'route middleware'),
    term('tenant', 'company'),
    term('workspace id', 'company id'),
    term('modal', 'dialog'),
    term('signup', 'sign up'),
  ],
  textRoots: null,
  allowedPaths: [],
  allowedInFiles: [],
  allowedPhrases: [{ phrase: 'aria modal', reason: 'the WAI-ARIA attribute' }],
  ...overrides,
});
const rejectedIn = (text) =>
  createChecker(config())
    .findInText(text)
    .map((hit) => hit.rejected);

test('a rejected word matches inside identifiers of every casing', () => {
  for (const text of [
    'routeGuards',
    'RouteGuard',
    'route_guards.ts',
    'route-guard',
    'ROUTE_GUARD',
    'Route guard',
  ])
    assert.deepEqual(rejectedIn(text), ['route guard'], text);
  assert.deepEqual(rejectedIn('const tenantId = 1'), ['tenant']);
  assert.deepEqual(rejectedIn('Tenants are companies'), ['tenant']);
});

test('a phrase also matches across a line break but not across punctuation or a blank line', () => {
  assert.deepEqual(rejectedIn('the route\nguard'), ['route guard']);
  assert.deepEqual(rejectedIn('route. guard'), []);
  assert.deepEqual(rejectedIn('route\n\nguard'), []);
});

test('a word that only contains a rejected one does not match', () => {
  for (const text of ['tenantless', 'dialogs', 'modalities', 'signUp'])
    assert.deepEqual(rejectedIn(text), [], text);
});

test('a phrase on the allow-list hides the rejected word it contains and nothing else', () => {
  assert.deepEqual(rejectedIn('<div aria-modal="true">'), []);
  assert.deepEqual(rejectedIn('ariaModal'), []);
  assert.deepEqual(rejectedIn('aria-modal and a modal'), ['modal']);
});

test('violations name the file, the line, the word and where the ruling is', () => {
  const read = () => 'fine\nconst workspaceId = tenant;\n';
  assert.deepEqual(createChecker(config()).findViolations(['src/a.ts'], read), [
    'src/a.ts:2: "workspace id"; say "company id" (dictionary.md)',
    'src/a.ts:2: "tenant"; say "company" (dictionary.md)',
  ]);
});

test('a file name is checked even when the file is not text', () => {
  const messages = createChecker(config()).findViolations(['docs/resource_modal.png'], () => {
    throw new Error('a png is never read');
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /file name says "modal"/);
});

test('with text roots, text is read under them and in root files only', () => {
  const checker = createChecker(config({ textRoots: ['app/', 'docs/'] }));
  const read = () => 'a tenant\n';
  for (const path of ['app/a.ts', 'docs/a.md', 'README.md'])
    assert.equal(checker.findViolations([path], read).length, 1, path);
  for (const path of ['.github/workflows/a.json', 'packaging/a.json'])
    assert.deepEqual(checker.findViolations([path], read), [], path);
  assert.equal(createChecker(config()).findViolations(['packaging/a.json'], read).length, 1);
});

test('exempt paths and per-file allowances are skipped', () => {
  const checker = createChecker(
    config({
      allowedPaths: [{ path: 'vendor/', reason: 'vendored' }],
      allowedInFiles: [{ path: 'docs/a.md', terms: ['tenant'], reason: 'quotes it' }],
    })
  );
  const read = () => 'a tenant and a signup\n';
  assert.ok(checker.isExempt('vendor/button.tsx'));
  assert.deepEqual(checker.findViolations(['vendor/button.tsx'], read), []);
  assert.equal(checker.findViolations(['docs/a.md'], read).length, 1);
  assert.equal(checker.findViolations(['docs/b.md'], read).length, 2);
});

test('a dictionary without its markers or with a short row is refused', () => {
  assert.throws(() => parseRejectedTerms('| Rejected | Say | Entry |'), /markers/);
  const table = (row) =>
    `<!-- terminology:enforced:start -->\n| Rejected | Say | Entry |\n| --- | --- | --- |\n${row}\n<!-- terminology:enforced:end -->`;
  assert.throws(() => parseRejectedTerms(table('| tenant | company |')), /malformed row/);
  assert.deepEqual(parseRejectedTerms(table('| tenant | company | The tenant |')), [
    { rejected: 'tenant', preferred: 'company', entry: 'The tenant' },
  ]);
});

/** A scratch repository with the given files, tracked by git. */
function scratch(files) {
  const directory = mkdtempSync(join(tmpdir(), 'terminology-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['add', '-A'], { cwd: directory });
  return directory;
}

test('the shared table rejects the bare framework name and keeps the names the framework owns', () => {
  const directory = scratch({
    'a.md': 'AdonisJS and adonis_schema and adonis-session are fine.\nAdonis is not.\n',
  });
  try {
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a\.md:2: "adonis"; say "AdonisJS"/);
    assert.match(result.stderr, /^1 rejected synonym/m);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("a repository's own dictionary and exemptions are read from its configuration", () => {
  const directory = scratch({
    'words.md':
      '<!-- terminology:enforced:start -->\n| Rejected | Say | Entry |\n| --- | --- | --- |\n| tenant | company | The tenant |\n<!-- terminology:enforced:end -->\n',
    'terminology.config.json': JSON.stringify({
      dictionary: 'words.md',
      allowedInFiles: [{ path: 'quoted.md', terms: ['tenant'], reason: 'quotes it' }],
    }),
    'quoted.md': 'a tenant\n',
    'a.md': 'a tenant\n',
  });
  try {
    assert.equal(loadConfig(directory).terms.at(-1).source, 'words.md');
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /a\.md:1: "tenant"; say "company" \(words\.md\)/);
    assert.match(result.stderr, /^1 rejected synonym/m);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('this repository passes its own check', () => {
  const output = execFileSync(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
  });
  assert.match(output, /no rejected synonyms/);
});
