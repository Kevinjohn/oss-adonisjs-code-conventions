#!/usr/bin/env node
// Fails on a rejected synonym, in file names and in the text of tracked files.
//
// The rejected synonyms are the Enforced rejections table of adonisjs/terminology.md in this
// repository, plus the same table in the checked repository's own dictionary, when it has one.
// The checked repository is the current directory. Its `terminology.config.json`, when present, names
// its dictionary and its exemptions:
//
//   {
//     "dictionary": "terminology.md",
//     "textRoots": ["app/", "tests/"],
//     "allowedPaths": [{ "path": "vendor/", "reason": "vendored code" }],
//     "allowedInFiles": [{ "path": "docs/a.md", "terms": ["tenant"], "reason": "quotes the word" }],
//     "allowedPhrases": [{ "phrase": "aria modal", "reason": "the WAI-ARIA attribute" }]
//   }
//
//   check-terminology            the whole tracked tree
//   check-terminology <path>...  only those paths
//
// A rejected entry is a word or a phrase. It matches whole words, ignoring case, inside
// identifiers, file names, comments and prose: `routeGuards`, `route_guards.ts` and "Route guard"
// all match `route guard`. A trailing "s" is ignored, so the plural needs no entry.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_DICTIONARY = fileURLToPath(new URL('../adonisjs/terminology.md', import.meta.url));
const SHARED_SOURCE = 'adonisjs/terminology.md in the code conventions';
const CONFIG_FILE = 'terminology.config.json';
const DEFAULT_ALLOWED_PATHS = [
  { path: 'pnpm-lock.yaml', reason: 'lockfile' },
  { path: 'package-lock.json', reason: 'lockfile' },
  { path: 'LICENSE', reason: 'licence text' },
  { path: 'LICENSE.md', reason: 'licence text' },
];
// Phrases that contain a shared rejected word but name something else.
const SHARED_ALLOWED_PHRASES = [
  { phrase: 'adonis js', reason: 'the word "AdonisJS" itself' },
  { phrase: 'adonis session', reason: "the framework's session cookie and table names" },
  { phrase: 'adonis schema', reason: "Lucid's migration tables" },
  { phrase: 'adonis group limit counter', reason: "a column Lucid's query builder names" },
  { phrase: 'adonis temp', reason: "a subquery alias Lucid's query builder names" },
  { phrase: 'adonis kit', reason: "the framework's build tool" },
];
const textFile = /\.(?:[cm]?[jt]sx?|json|md|mdx)$/;
const wordPattern = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/g;
// Words of one phrase may be separated by spaces, underscores and hyphens, or by a line break.
const phraseGap = /^[\s_-]*$/;

const stem = (word) => {
  const lower = word.toLowerCase();
  return lower.length > 3 && lower.endsWith('s') ? lower.slice(0, -1) : lower;
};
const phraseWords = (phrase) => phrase.split(' ').map(stem);

/**
 * Read the rejected synonyms, the words that replace them and the entries that rule them from a
 * dictionary's table between its terminology markers.
 *
 * @throws When the markers are missing or a row does not have three cells.
 */
export function parseRejectedTerms(dictionary) {
  const [, rest] = dictionary.split('<!-- terminology:enforced:start -->');
  const table = rest?.split('<!-- terminology:enforced:end -->')[0];
  if (rest === undefined || table === rest)
    throw new Error('The dictionary lacks its terminology:enforced markers.');
  return table
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 3 || cells.some((cell) => cell === ''))
        throw new Error(`The enforced table has a malformed row: ${line}`);
      const [rejected, preferred, entry] = cells;
      return { rejected, preferred, entry };
    });
}

/**
 * Read a repository's configuration and both dictionaries.
 *
 * @throws When the configuration is not valid JSON or a dictionary lacks its table.
 */
export function loadConfig(root) {
  const configPath = join(root, CONFIG_FILE);
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const shared = parseRejectedTerms(readFileSync(SHARED_DICTIONARY, 'utf8'));
  const own = config.dictionary
    ? parseRejectedTerms(readFileSync(join(root, config.dictionary), 'utf8'))
    : [];
  return {
    terms: [
      ...shared.map((term) => ({ ...term, source: SHARED_SOURCE })),
      ...own.map((term) => ({ ...term, source: config.dictionary })),
    ],
    textRoots: config.textRoots ?? null,
    allowedPaths: [
      ...DEFAULT_ALLOWED_PATHS,
      ...(config.dictionary ? [{ path: config.dictionary, reason: 'the dictionary' }] : []),
      { path: CONFIG_FILE, reason: 'the exemptions quote rejected words' },
      ...(config.allowedPaths ?? []),
    ],
    allowedInFiles: config.allowedInFiles ?? [],
    allowedPhrases: [...SHARED_ALLOWED_PHRASES, ...(config.allowedPhrases ?? [])],
  };
}

/** Build the check for one configuration: `{ isExempt, findInText, findViolations }`. */
export function createChecker(config) {
  const rejected = config.terms.map((term) => ({ ...term, words: phraseWords(term.rejected) }));
  const allowed = config.allowedPhrases.map(({ phrase }) => phraseWords(phrase));
  const underPath = (path, entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry);

  /** Report whether the check skips this path's name and text. */
  const isExempt = (path) => config.allowedPaths.some(({ path: entry }) => underPath(path, entry));

  // Text is read under the configured roots and in root files; with no roots, everywhere.
  const readsText = (path) =>
    textFile.test(path) &&
    (config.textRoots === null ||
      !path.includes('/') ||
      config.textRoots.some((entry) => path.startsWith(entry)));

  /** Split text into stemmed words with their offsets and the gap that precedes each one. */
  function wordsOf(text) {
    const words = [];
    let previousEnd = 0;
    for (const match of text.matchAll(wordPattern)) {
      words.push({
        stem: stem(match[0]),
        start: match.index,
        gap: text.slice(previousEnd, match.index),
      });
      previousEnd = match.index + match[0].length;
    }
    return words;
  }

  function phraseAt(words, index, phrase) {
    return phrase.every((word, offset) => {
      const candidate = words[index + offset];
      if (!candidate || candidate.stem !== word) return false;
      return offset === 0 || (phraseGap.test(candidate.gap) && !/\n\s*\n/.test(candidate.gap));
    });
  }

  /** List the rejected synonyms in a string: `{ rejected, preferred, source, offset }` per match. */
  function findInText(text, skipped = []) {
    const words = wordsOf(text);
    const ignored = new Set();
    words.forEach((_, index) =>
      allowed.forEach((phrase) => {
        if (phraseAt(words, index, phrase))
          phrase.forEach((__, offset) => ignored.add(index + offset));
      })
    );
    const found = [];
    words.forEach((word, index) =>
      rejected.forEach((term) => {
        if (skipped.includes(term.rejected) || !phraseAt(words, index, term.words)) return;
        if (term.words.some((__, offset) => ignored.has(index + offset))) return;
        found.push({
          rejected: term.rejected,
          preferred: term.preferred,
          source: term.source,
          offset: word.start,
        });
      })
    );
    return found;
  }

  /**
   * Check paths and report one message per rejected synonym. `read` returns a file's text, or
   * `undefined` for a file that is gone or not text.
   */
  function findViolations(paths, read) {
    const messages = [];
    for (const path of paths) {
      if (isExempt(path)) continue;
      const skipped = config.allowedInFiles
        .filter((entry) => entry.path === path)
        .flatMap((entry) => entry.terms);
      for (const hit of findInText(path.replaceAll('/', ' '), skipped))
        messages.push(
          `${path}: the file name says "${hit.rejected}"; say "${hit.preferred}" (${hit.source})`
        );
      if (!readsText(path)) continue;
      const text = read(path);
      if (text === undefined) continue;
      for (const hit of findInText(text, skipped)) {
        const line = text.slice(0, hit.offset).split('\n').length;
        messages.push(
          `${path}:${line}: "${hit.rejected}"; say "${hit.preferred}" (${hit.source})`
        );
      }
    }
    return messages;
  }

  return { isExempt, findInText, findViolations };
}

function main() {
  const root = process.cwd();
  const checker = createChecker(loadConfig(root));
  const given = process.argv.slice(2);
  const paths = given.length
    ? given
    : execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
        .split('\n')
        .filter(Boolean);
  const messages = checker.findViolations(
    paths.filter((path) => existsSync(join(root, path))),
    (path) => readFileSync(join(root, path), 'utf8')
  );
  for (const message of messages) console.error(message);
  if (messages.length) {
    console.error(`${messages.length} rejected synonym(s).`);
    process.exitCode = 1;
  } else console.log(`terminology: ${paths.length} path(s) checked, no rejected synonyms`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
