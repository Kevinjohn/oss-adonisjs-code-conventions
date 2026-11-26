#!/usr/bin/env node
// Checks the checklist items that have one right answer, the ones `adonisjs/checks.json` marks
// "script", and the part of each item marked "both" that the files decide. The same tree gives the
// same findings on every run.
//
//   check-conventions           the repository in the current directory
//   check-conventions --json    the findings as JSON
//
// The repository is read from its root. Every folder with `adonisrc.ts` is an application, and
// every folder with a `package.json` that lists `@adonisjs/core` and has no `adonisrc.ts` is a
// package. Frontend code is not checked here.
//
// A finding stays open until the code changes or the repository's departures list covers it.
// `conventions.config.json` at the root links a finding to a numbered entry of that list:
//
//   {
//     "departures": {
//       "file": "DECISIONS.md",
//       "heading": "Framework departures",
//       "entries": [{ "entry": 28, "item": "TOOL-2" }, { "entry": 33, "item": "CTL-4", "path": "apps/backend/app/controllers/" }]
//     }
//   }
//
// The entry must exist once in the file as a numbered list entry, under `heading` when one is given. For a law it must be marked
// **Aligning** and name an issue. A link that covers no finding is itself reported, so an entry
// does not outlive the code it covered.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKLIST = join(HERE, '../adonisjs/checklist.md');
const MANIFEST = join(HERE, '../adonisjs/checks.json');
const CONFIG_FILE = 'conventions.config.json';
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'build', 'dist', 'coverage', 'tmp']);
const SOURCE = /\.(?:ts|tsx|mts)$/;
// The files NAM-1 names: code and templates, not documentation, data or assets.
const NAMED = /\.(?:ts|tsx|mts|js|jsx|mjs|cjs|edge|stub)$/;
// Names a tool prescribes.
const TOOL_NAMES = new Set(['vite-env.d.ts']);
// Official packages list this one under `dependencies`.
const NOT_PEERS = new Set(['@adonisjs/presets']);
// The framework writes these (LAY-4); no item covers a generated file.
const GENERATED = ['.adonisjs/', 'database/schema.ts'];
const DEPENDENCY_LISTS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** The id, tier and text of every item in the checklist. */
export function readItems() {
  const items = new Map();
  for (const line of readFileSync(CHECKLIST, 'utf8').split('\n')) {
    const item = line.match(/^- \[ \] \*\*([A-Z]+-\d+)\*\* \((Law|Rule|Guideline)\) (.+)$/);
    if (item) items.set(item[1], { tier: item[2], text: item[3] });
  }
  return items;
}

/** How each item is checked: lint, script, both, planned, model or guideline. */
export const readManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));

function walk(root, folder = '') {
  const out = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) out.push(...walk(root, path));
    } else out.push(path);
  }
  return out;
}

function listFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter((path) => path && existsSync(join(root, path)));
  } catch {
    return walk(root);
  }
}

/** Blanks comments and keeps every line break, so a line number still points at the file. */
function withoutComments(text) {
  let out = '';
  let quote = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      out += char;
      if (char === '\\') out += text[++index] ?? '';
      else if (char === quote || (char === '\n' && quote !== '`')) quote = null;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
    } else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop - 1;
    } else if (char === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index);
      index = (end === -1 ? text.length : end) - 1;
    } else out += char;
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const pascal = (name) =>
  name
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

/** The text from an opening bracket to the one that closes it. */
function balanced(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const close = pairs[text[open]];
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === text[open]) depth++;
    else if (text[index] === close && --depth === 0) return text.slice(open, index + 1);
  }
  return text.slice(open);
}
const callText = balanced;

/** The lowest Node major a range such as `>=24.0.0` allows, or null when it names none. */
function lowestMajor(range) {
  const majors = [...String(range ?? '').matchAll(/(?:>=|\^|~|=|^|\s)\s*(\d+)/g)].map((match) => Number(match[1]));
  return majors.length === 0 ? null : Math.min(...majors);
}

function createRoot(repository, folder, kind, files) {
  const prefix = folder === '.' ? '' : `${folder}/`;
  const own = files
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => !GENERATED.some((generated) => path === generated || path.startsWith(generated)));
  const cache = new Map();
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, readFileSync(join(repository, prefix + path), 'utf8'));
    return cache.get(path);
  };
  return {
    kind,
    folder,
    files: own,
    has: (path) => own.includes(path),
    read,
    code: (path) => withoutComments(read(path)),
    json: (path) => JSON.parse(read(path)),
    source: (...folders) =>
      own.filter(
        (path) =>
          SOURCE.test(path) &&
          !path.endsWith('.d.ts') &&
          folders.some((start) => (start.endsWith('/') ? path.startsWith(start) : path === start))
      ),
    at: (path) => prefix + path,
  };
}

/** Every match of a pattern in the given files, as findings. */
function matches(root, paths, pattern, message) {
  const found = [];
  for (const path of paths) {
    const code = root.code(path);
    for (const match of code.matchAll(pattern)) {
      found.push({ path, line: lineOf(code, match.index + match[0].search(/\S/)), message });
    }
  }
  return found;
}

const CLASS = /^(export\s+)?(default\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
const DEFAULT_EXPORT_FOLDERS = [
  'app/controllers/',
  'app/models/',
  'app/middleware/',
  'app/exceptions/',
  'app/events/',
  'app/listeners/',
  'app/mails/',
  'app/policies/',
  'app/transformers/',
  'providers/',
  'database/seeders/',
  'commands/',
];
const APP_CODE = ['app/', 'providers/', 'start/', 'commands/', 'database/'];
const SHIPPED = ['src/', 'providers/', 'services/', 'commands/', 'index.ts', 'configure.ts'];
const CONSOLE = /\bconsole\.(?:log|info|warn|error|debug|trace|table|dir)\(/g;
const VALIDATOR = /^export const (\w+)\s*=\s*vine\s*\.\s*(?:create|compile|withMetaData)\b/gm;

function commandFiles(root) {
  return root
    .source('commands/')
    .filter((path) => !basename(path).startsWith('_'))
    .map((path) => {
      const code = root.code(path);
      const name = code.match(/static\s+commandName\s*=\s*['"]([^'"]+)['"]/);
      return { path, code, name: name?.[1] ?? null, line: name ? lineOf(code, name.index) : 1 };
    });
}

/**
 * The checks, by item. Each takes a root and returns the places the item fails at. `kinds` says
 * which roots the item covers; `repository` runs once, on the root of the repository.
 */
export const CHECKS = {
  'NAM-1': {
    kinds: ['application', 'package'],
    run(root) {
      const found = [];
      const folders = new Set();
      for (const path of root.files.filter((file) => NAMED.test(file))) {
        const parts = path.split('/');
        const file = parts.pop();
        if (!TOOL_NAMES.has(file) && !/^_?[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(file)) {
          found.push({ path, line: null, message: 'The file name is not snake_case.' });
        }
        parts.forEach((part, index) => {
          const folder = parts.slice(0, index + 1).join('/');
          if (part.startsWith('.') || /^[a-z0-9_]+$/.test(part) || folders.has(folder)) return;
          folders.add(folder);
          found.push({ path: folder, line: null, message: 'The folder name is not snake_case.' });
        });
      }
      return found;
    },
  },
  'NAM-3': {
    kinds: ['application', 'package'],
    run(root) {
      const found = [];
      const paths = root.files.filter((path) => SOURCE.test(path) && !path.endsWith('.d.ts') && !path.startsWith('tests/'));
      for (const path of paths) {
        const code = root.code(path);
        const classes = [...code.matchAll(CLASS)];
        if (root.kind === 'package' && path === 'src/errors.ts') {
          for (const match of classes.filter(([, , isDefault]) => isDefault)) {
            found.push({ path, line: lineOf(code, match.index), message: 'An exception in `src/errors.ts` is a named export.' });
          }
          continue;
        }
        if (classes.length > 1) {
          found.push({ path, line: lineOf(code, classes[1].index), message: 'The file holds more than one class.' });
        }
        if (classes.length === 0) continue;
        const [, exported, inlineDefault, name] = classes[0];
        const isDefault = Boolean(inlineDefault) || new RegExp(`^export default ${name}\\b`, 'm').test(code);
        const isNamed = (Boolean(exported) && !inlineDefault) || new RegExp(`^export \\{[^}]*\\b${name}\\b`, 'm').test(code);
        const line = lineOf(code, classes[0].index);
        if (DEFAULT_EXPORT_FOLDERS.some((folder) => path.startsWith(folder)) && isNamed) {
          found.push({ path, line, message: 'The class is a named export; its folder takes a default export.' });
        }
        if (root.kind === 'application' && path.startsWith('app/services/') && isDefault) {
          found.push({ path, line, message: 'The service is a default export; a service is a named export.' });
        }
      }
      return found;
    },
  },
  'IMP-1': {
    kinds: ['application', 'package'],
    run: (root) =>
      root.json('package.json').type === 'module'
        ? []
        : [{ path: 'package.json', line: null, message: '`"type": "module"` is not set.' }],
  },
  'IMP-4': {
    kinds: ['application'],
    run: (root) => [
      ...matches(
        root,
        root.source('app/', 'start/', 'config/', 'providers/'),
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]\.\.?\//g,
        'A relative import; an application imports through a `#` alias.'
      ),
      // The kit declares no alias for `commands/`, so a file there imports its neighbour by path.
      ...matches(
        root,
        root.source('commands/', 'database/'),
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]\.\.\//g,
        'A relative import of another folder; an application imports through a `#` alias.'
      ),
    ],
  },
  'IMP-5': {
    kinds: ['package'],
    run(root) {
      const found = [];
      if (Object.keys(root.json('package.json').imports ?? {}).some((key) => key.startsWith('#'))) {
        found.push({ path: 'package.json', line: null, message: 'It declares a `#` alias under `imports`.' });
      }
      for (const path of root.files.filter((file) => SOURCE.test(file) && !file.endsWith('.d.ts'))) {
        const code = root.code(path);
        for (const match of code.matchAll(/(?:\bfrom\s+|\bimport\s+)['"]([^'"]+)['"]/g)) {
          const line = lineOf(code, match.index);
          if (match[1].startsWith('#')) found.push({ path, line, message: 'A `#` alias; a package imports by relative path.' });
          else if (match[1].startsWith('.') && !match[1].endsWith('.ts')) {
            found.push({ path, line, message: 'A static relative import that does not end in `.ts`.' });
          }
        }
        for (const match of code.matchAll(/\bimport\s*\(\s*['"]([.#][^'"]*)['"]/g)) {
          const line = lineOf(code, match.index);
          if (match[1].startsWith('#')) found.push({ path, line, message: 'A `#` alias; a package imports by relative path.' });
          else if (!path.startsWith('tests/') && !match[1].endsWith('.js')) {
            found.push({ path, line, message: 'A lazy relative `import()` that does not end in `.js`.' });
          }
        }
      }
      return found;
    },
  },
  'TOOL-2': {
    repository: true,
    run(root) {
      const preset = '@adonisjs/prettier-config';
      const declared =
        (root.has('package.json') && root.json('package.json').prettier === preset) ||
        ['.prettierrc', '.prettierrc.json'].some((path) => root.has(path) && root.read(path).trim() === `"${preset}"`);
      return declared ? [] : [{ path: 'package.json', line: null, message: `Prettier is not set to \`"${preset}"\` alone.` }];
    },
  },
  'TOOL-3': {
    kinds: ['application', 'package'],
    run(root) {
      const preset = `@adonisjs/tsconfig/tsconfig.${root.kind === 'application' ? 'app' : 'package'}.json`;
      if (!root.has('tsconfig.json')) return [{ path: 'tsconfig.json', line: null, message: 'There is no `tsconfig.json`.' }];
      const extended = root.read('tsconfig.json').match(/"extends"\s*:\s*(\[[^\]]*\]|"[^"]*")/);
      return extended?.[1].includes(`"${preset}"`)
        ? []
        : [{ path: 'tsconfig.json', line: null, message: `It does not extend \`${preset}\`.` }];
    },
  },
  'TOOL-4': {
    repository: true,
    run(root) {
      const major = lowestMajor(root.json('package.json').engines?.node);
      return major !== null && major >= 24
        ? []
        : [{ path: 'package.json', line: null, message: '`engines.node` does not require Node 24 or later.' }];
    },
  },
  'TOOL-6': {
    repository: true,
    run: (root) =>
      ['.editorconfig', '.gitignore', '.prettierignore', 'README.md', 'LICENSE.md']
        .filter((path) => !root.has(path))
        .map((path) => ({ path, line: null, message: 'The file is missing from the repository root.' })),
  },
  'LAY-3': {
    kinds: ['application'],
    run(root) {
      const folders = new Set();
      for (const path of root.files) {
        const match = path.match(/^(app\/(?:.*\/)?(?:utils|helpers|lib))\//);
        if (match) folders.add(match[1]);
      }
      return [...folders].map((path) => ({ path, line: null, message: 'A catch-all folder under `app/`.' }));
    },
  },
  'NAM-6': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const { path, code, name, line } of commandFiles(root)) {
        if (!name?.includes(':')) continue;
        const file = name.replace(/[:-]/g, '_');
        if (basename(path) !== `${file}.ts`) {
          found.push({ path, line, message: `The command \`${name}\` lives in \`${file}.ts\`.` });
        }
        const exported = code.match(/export default class (\w+)/);
        if (exported && exported[1] !== pascal(file)) {
          found.push({ path, line: lineOf(code, exported.index), message: `The command \`${name}\` exports \`${pascal(file)}\`.` });
        }
      }
      return found;
    },
  },
  'CFG-2': {
    kinds: ['application'],
    run: (root) => [
      ...matches(
        root,
        root.source(...APP_CODE).filter((path) => path !== 'start/env.ts'),
        /process\.env\b|#start\/env\b/g,
        'Reads `env` or `process.env` outside `config/`.'
      ),
      ...root.source('bin/').flatMap((path) => {
        const code = root.code(path);
        return [...code.matchAll(/\bprocess\.env\b/g)]
          .filter((match) => {
            const before = code.slice(code.lastIndexOf('\n', match.index) + 1, match.index);
            const after = code.slice(match.index + match[0].length);
            // Setting or deleting a variable, or handing the whole object on, is not reading one.
            if (/^(?:\.\w+\b|\[[^\]]+\])\s*=(?!=)/.test(after) || /\bdelete\s+$/.test(before)) return false;
            return /^[.[]/.test(after) || /(?:=|\.\.\.)\s*$/.test(before);
          })
          .map((match) => ({ path, line: lineOf(code, match.index), message: 'A `bin/` entry point reads a variable from `process.env`.' }));
      }),
    ],
  },
  'CFG-3': {
    kinds: ['application'],
    run: (root) =>
      matches(
        root,
        root.source(...APP_CODE, 'config/').filter((path) => path !== 'start/env.ts'),
        /NODE_ENV['"\])]*\s*[!=]==?|[!=]==?\s*(?:process\.env\.NODE_ENV\b|env\.get\(\s*['"]NODE_ENV)/g,
        'Compares `NODE_ENV`; ask `app.inProduction`, `app.inDev` or `app.inTest`.'
      ),
  },
  'CTL-4': {
    kinds: ['application'],
    run: (root) =>
      matches(
        root,
        root.source('app/controllers/'),
        /\(\s*\w+\s*:\s*HttpContext\s*[,)]/g,
        'The action takes the HTTP context whole; it destructures what it uses.'
      ),
  },
  'CTL-5': {
    kinds: ['application'],
    run: (root) =>
      matches(
        root,
        root.source('app/controllers/'),
        /^[ \t]*(?:(?:private|protected)\s+(?:static\s+)?(?:async\s+)?\*?\w+\s*[(<]|(?:private|protected)\s+(?:static\s+)?(?:readonly\s+)?\w+\s*=\s*(?:async\s*)?(?:\(|function\b|\w+\s*=>)|(?:static\s+)?(?:async\s+)?#\w+\s*\()/gm,
        'A private or protected method in a controller.'
      ),
  },
  'VAL-2': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('app/validators/')) {
        const code = root.code(path);
        for (const match of code.matchAll(VALIDATOR)) {
          if (!match[1].endsWith('Validator')) {
            found.push({ path, line: lineOf(code, match.index), message: `\`${match[1]}\` does not end in \`Validator\`.` });
          }
        }
      }
      return found;
    },
  },
  'VAL-3': {
    kinds: ['application'],
    run(root) {
      const found = [];
      const seen = new Map();
      for (const path of root.source('app/validators/')) {
        const code = root.code(path);
        for (const match of code.matchAll(VALIDATOR)) {
          if (seen.has(match[1])) {
            found.push({ path, line: lineOf(code, match.index), message: `\`${match[1]}\` is also exported from \`${seen.get(match[1])}\`.` });
          } else seen.set(match[1], path);
        }
      }
      return found;
    },
  },
  'VAL-4': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('app/')) {
        const code = root.code(path);
        // A read handed straight to a validator is validated.
        const validated = [...code.matchAll(/\b(?:validateUsing|tryValidateUsing|validate|tryValidate)\(/g)].map((call) => [
          call.index,
          call.index + call[0].length - 1 + callText(code, call.index + call[0].length - 1).length,
        ]);
        for (const match of code.matchAll(/\brequest\.(?:all|body|qs|input|only|except)\(/g)) {
          if (validated.some(([start, end]) => match.index > start && match.index < end)) continue;
          found.push({ path, line: lineOf(code, match.index), message: 'Reads the request without a validator.' });
        }
      }
      return found;
    },
  },
  'EXC-5': {
    kinds: ['application'],
    run(root) {
      const found = [];
      const classes = [];
      for (const path of root.source('app/')) {
        const code = root.code(path);
        for (const match of code.matchAll(/class\s+(\w+)\s+extends\s+(\w+)/g)) {
          classes.push({ path, name: match[1], parent: match[2], line: lineOf(code, match.index), status: /\bstatic\s+(?:readonly\s+)?status\b/.test(code) });
        }
      }
      const byName = new Map(classes.map((entry) => [entry.name, entry]));
      const parents = new Set(classes.map((entry) => entry.parent));
      // The classes between this one and `Exception`, or null when it is not an exception.
      const chain = (entry, seen = new Set()) => {
        if (entry.parent === 'Exception') return [entry];
        const parent = byName.get(entry.parent);
        if (!parent || seen.has(parent.name)) return null;
        const rest = chain(parent, seen.add(entry.name));
        return rest && [entry, ...rest];
      };
      for (const entry of classes) {
        const { path, line } = entry;
        if (entry.parent === 'Error') found.push({ path, line, message: 'The class extends `Error`, not `Exception`.' });
        const ancestors = chain(entry);
        // A base class that is only extended is not checked.
        if (!ancestors || parents.has(entry.name)) continue;
        if (!path.startsWith('app/exceptions/') || !path.endsWith('_exception.ts')) {
          found.push({ path, line, message: 'An exception lives in `app/exceptions/<name>_exception.ts`.' });
        }
        if (!ancestors.some((ancestor) => ancestor.status)) found.push({ path, line, message: 'The exception sets no `static status`.' });
      }
      return found;
    },
  },
  'EXC-7': {
    kinds: ['application'],
    run(root) {
      const found = [];
      const check = (path, code, index, value) => {
        if (/^E_[A-Z0-9_]+$/.test(value)) return;
        found.push({ path, line: lineOf(code, index), message: `The code \`${value}\` is not \`E_UPPER_SNAKE\`.` });
      };
      for (const path of root.source('app/')) {
        const code = root.code(path);
        if (path.startsWith('app/exceptions/')) {
          for (const match of code.matchAll(/\bstatic\s+(?:readonly\s+)?code\s*=\s*['"]([^'"]+)['"]/g)) check(path, code, match.index, match[1]);
        }
        for (const match of code.matchAll(/\bnew\s+\w*Exception\s*\(/g)) {
          const open = match.index + match[0].length - 1;
          const option = balanced(code, open).match(/\bcode\s*:\s*['"]([^'"]+)['"]/);
          if (option) check(path, code, open + option.index, option[1]);
        }
      }
      return found;
    },
  },
  'DB-6': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('database/migrations/')) {
        const code = root.code(path);
        const missing = [
          [/\bextends\s+BaseSchema\b/, 'does not extend `BaseSchema`'],
          [/\bprotected\s+tableName\b/, 'sets no `protected tableName`'],
          [/\bup\s*\(/, 'has no `up()`'],
          [/\bdown\s*\(/, 'has no `down()`'],
        ].filter(([pattern]) => !pattern.test(code));
        for (const [, what] of missing) found.push({ path, line: null, message: `The migration ${what}.` });
        if (!/^\d+_[a-z0-9_]+\.ts$/.test(basename(path))) {
          found.push({ path, line: null, message: 'The file is not named as `node ace make:migration` names it.' });
        }
      }
      return found;
    },
  },
  'DB-9': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('database/migrations/')) {
        const code = root.code(path);
        for (const match of code.matchAll(/\.references\(/g)) {
          // The chain runs to the end of its line and over the lines after it that start with a dot.
          const rest = code.slice(match.index);
          const statement = rest.match(/^[^\n]*(?:\n[ \t]*\.[^\n]*)*/)[0];
          const missing = ['.inTable(', '.onDelete('].filter((call) => !statement.includes(call));
          if (missing.length > 0) {
            found.push({ path, line: lineOf(code, match.index), message: `The foreign key has no \`${missing.join('` and no `')}...)\`.` });
          }
        }
      }
      return found;
    },
  },
  'DB-10': {
    kinds: ['application'],
    run(root) {
      if (!root.has('config/database.ts')) return [];
      const code = root.code('config/database.ts');
      const blocks = [...code.matchAll(/\bmigrations\s*:\s*\{/g)].map((match) => balanced(code, match.index + match[0].length - 1));
      return blocks.length > 0 && blocks.every((text) => /disableRollbacksInProduction\s*:\s*true/.test(text))
        ? []
        : [{ path: 'config/database.ts', line: null, message: '`disableRollbacksInProduction: true` is not set for every connection.' }];
    },
  },
  'SVC-8': {
    kinds: ['application'],
    run: (root) => matches(root, root.source('app/', 'providers/', 'start/', 'database/'), CONSOLE, 'Writes to `console`; log through the logger.'),
  },
  'CMD-1': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const { path, code, name, line } of commandFiles(root)) {
        if (!name) continue;
        if (!/^export default class (?:\w+ )?extends \w+/m.test(code)) {
          found.push({ path, line, message: 'The command is not a default-exported class that extends a command class.' });
        }
        if (!/\bstatic\s+description\b/.test(code)) found.push({ path, line, message: 'The command sets no `static description`.' });
      }
      return found;
    },
  },
  'CMD-2': {
    kinds: ['application'],
    run: (root) =>
      commandFiles(root)
        .filter(({ name }) => name && name.split(':').length > 2)
        .map(({ path, line, name }) => ({ path, line, message: `The name \`${name}\` has more than one colon.` })),
  },
  'CMD-4': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('commands/')) {
        const code = root.code(path);
        for (const match of code.matchAll(/@(?:args|flags)\.\w+\s*\(/g)) {
          const call = callText(code, match.index + match[0].length - 1);
          if (!/\bdescription\s*:/.test(call)) {
            found.push({ path, line: lineOf(code, match.index), message: 'The argument or flag has no description.' });
          }
        }
      }
      return found;
    },
  },
  'CMD-5': {
    kinds: ['application'],
    run: (root) => matches(root, root.source('commands/'), CONSOLE, 'Writes to `console`; use `this.logger` or `this.ui`.'),
  },
  'CMD-8': {
    kinds: ['application'],
    run: (root) =>
      commandFiles(root)
        .filter(({ name }) => !name)
        .map(({ path }) => ({ path, line: null, message: 'The file sets no `static commandName` and its name does not start with `_`.' })),
  },
  'TST-11': {
    kinds: ['application'],
    run(root) {
      const found = [];
      const message = 'A function or class declared at the top level of a test file.';
      for (const path of root.source('tests/').filter((file) => file.endsWith('.spec.ts'))) {
        const code = root.code(path);
        if (!/\btest(?:\.group)?\(/.test(code)) continue;
        for (const match of code.matchAll(/^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*\w+|(?:abstract\s+)?class\s+\w+)/gm)) {
          found.push({ path, line: lineOf(code, match.index), message });
        }
        for (const match of code.matchAll(/^(?:export\s+)?const\s+\w+\s*(?::[^=\n]+)?=\s*(?:async\s*)?/gm)) {
          const after = code.slice(match.index + match[0].length);
          const arrow = after.startsWith('(')
            ? /^\s*(?::[^=]+?)?=>/.test(after.slice(balanced(after, 0).length))
            : /^(?:function\b|\w+\s*=>)/.test(after);
          if (arrow) found.push({ path, line: lineOf(code, match.index), message });
        }
      }
      return found;
    },
  },
  'TST-12': {
    kinds: ['application'],
    run: (root) =>
      matches(
        root,
        root.source('tests/').filter((path) => path.endsWith('.spec.ts')),
        /^(?:let|var)\s/gm,
        'A `let` or `var` at file scope in a test file.'
      ),
  },
  'TST-13': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('tests/')) {
        const code = root.code(path);
        for (const match of code.matchAll(/\bgetByText\(\s*['"`]/g)) {
          const call = callText(code, match.index + 'getByText'.length);
          if (!/\bexact\s*:/.test(call)) {
            found.push({ path, line: lineOf(code, match.index), message: '`getByText` with a string and no `exact` option.' });
          }
        }
      }
      return found;
    },
  },
  'TST-15': {
    kinds: ['application'],
    run(root) {
      const pkg = root.json('package.json');
      if (!DEPENDENCY_LISTS.some((list) => pkg[list]?.['@adonisjs/session'])) return [];
      return root.has('.env.test') && /^SESSION_DRIVER=(['"]?)memory\1\s*$/m.test(root.read('.env.test'))
        ? []
        : [{ path: '.env.test', line: null, message: '`SESSION_DRIVER=memory` is not set.' }];
    },
  },
  'PKG-1': {
    kinds: ['package'],
    run(root) {
      const source = root.files.filter((path) => SOURCE.test(path) && !path.endsWith('.d.ts'));
      const allowed = ['src', 'providers', 'services', 'commands', 'stubs', 'factories', 'modules', 'bin', 'tests'];
      const folders = new Set(source.filter((path) => path.includes('/')).map((path) => path.split('/')[0]));
      return [
        ...source
          .filter((path) => !path.includes('/') && !['index.ts', 'configure.ts'].includes(path) && !/\.config\.m?ts$/.test(path))
          .map((path) => ({ path, line: null, message: 'A source file at the package root that is not `index.ts` or `configure.ts`.' })),
        ...[...folders]
          .filter((folder) => !allowed.includes(folder) && !folder.startsWith('.'))
          .map((path) => ({ path, line: null, message: 'Source in a root folder that is not `src/` or one of the framework\'s folders.' })),
      ];
    },
  },
  'PKG-5': {
    kinds: ['package'],
    run(root) {
      const pkg = root.json('package.json');
      const major = lowestMajor(pkg.engines?.node);
      const files = Array.isArray(pkg.files) ? pkg.files : [];
      return [
        [pkg.type === 'module', '`"type": "module"` is not set.'],
        [major !== null && major >= 24, '`engines.node` does not require Node 24 or later.'],
        [['build', '!build/bin', '!build/tests'].every((entry) => files.includes(entry)), '`files` does not list `build`, `!build/bin` and `!build/tests`.'],
        [!files.some((entry) => !entry.startsWith('!') && /(?:^|\/)(?:tests?|bin)(?:\/|$)/.test(entry)), '`files` lists tests or `bin`.'],
        [pkg.exports !== null && typeof pkg.exports === 'object', 'There is no `exports` map.'],
      ]
        .filter(([holds]) => !holds)
        .map(([, message]) => ({ path: 'package.json', line: null, message }));
    },
  },
  'PKG-6': {
    kinds: ['package'],
    run(root) {
      const pkg = root.json('package.json');
      const found = Object.keys(pkg.dependencies ?? {})
        .filter((name) => name.startsWith('@adonisjs/') && !NOT_PEERS.has(name))
        .map((name) => ({ path: 'package.json', line: null, message: `\`${name}\` is under \`dependencies\`.` }));
      const imported = new Set();
      for (const path of root.source(...SHIPPED)) {
        for (const match of root.code(path).matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](@adonisjs\/[^/'"]+)/g)) {
          imported.add(match[1]);
        }
      }
      imported.delete(pkg.name);
      for (const name of NOT_PEERS) imported.delete(name);
      for (const name of [...imported].sort()) {
        for (const list of ['peerDependencies', 'devDependencies']) {
          if (!pkg[list]?.[name]) found.push({ path: 'package.json', line: null, message: `\`${name}\` is imported and is not under \`${list}\`.` });
        }
      }
      return found;
    },
  },
  'PKG-7': {
    kinds: ['package'],
    run: (root) =>
      Object.entries(root.json('package.json').peerDependencies ?? {})
        .filter(([, range]) => !range.startsWith('workspace:') && !range.split('||').every((part) => /^\^\d/.test(part.trim())))
        .map(([name, range]) => ({ path: 'package.json', line: null, message: `The peer range \`${name}: ${range}\` does not name the major with \`^\`.` })),
  },
  'PKG-18': {
    kinds: ['package'],
    run(root) {
      if (!root.files.some((path) => path.startsWith('stubs/'))) return [];
      return root.has('stubs/main.ts') && /export const stubsRoot\s*=\s*import\.meta\.dirname\b/.test(root.code('stubs/main.ts'))
        ? []
        : [{ path: 'stubs/main.ts', line: null, message: 'It does not export `stubsRoot = import.meta.dirname`.' }];
    },
  },
  'PKG-23': {
    kinds: ['package'],
    run: (root) =>
      matches(
        root,
        root.source('src/', 'providers/', 'services/', 'commands/'),
        /process\.env\b|services\/env\b/g,
        'Shipped code reads `process.env` or the `env` service.'
      ),
  },
  'PKG-25': {
    kinds: ['package'],
    run(root) {
      const found = [];
      for (const path of root.source('providers/')) {
        const code = root.code(path);
        const name = basename(path, '.ts');
        if (!name.endsWith('_provider')) {
          found.push({ path, line: null, message: 'The file is not named `<name>_provider.ts`.' });
          continue;
        }
        if (!new RegExp(`^export default class ${pascal(name)}\\b`, 'm').test(code)) {
          found.push({ path, line: null, message: `It does not default-export \`${pascal(name)}\`.` });
        }
        if (!/constructor\(protected app: ApplicationService\)/.test(code)) {
          found.push({ path, line: null, message: 'It has no `constructor(protected app: ApplicationService)`.' });
        }
      }
      return found;
    },
  },
  'PKG-43': {
    kinds: ['package'],
    run(root) {
      const pkg = root.json('package.json');
      return pkg.devDependencies?.c8 && Object.values(pkg.scripts ?? {}).some((script) => /\bc8\b/.test(script))
        ? []
        : [{ path: 'package.json', line: null, message: 'No script collects coverage with `c8`.' }];
    },
  },
  'PKG-47': {
    kinds: ['package'],
    run: (root) => matches(root, root.source(...SHIPPED), /\bthrow\s+new\s+Error\(/g, 'Throws a bare `Error`.'),
  },
};

/** Items the manifest marks "script" that another script of this repository checks. */
export const CHECKED_ELSEWHERE = { 'VOC-2': 'check-terminology' };

/** Reads the links from findings to entries of the departures list, with what is wrong in them. */
function readDepartures(repository, items) {
  const path = join(repository, CONFIG_FILE);
  if (!existsSync(path)) return { links: [], errors: [] };
  const config = JSON.parse(readFileSync(path, 'utf8')).departures ?? {};
  const file = config.file ?? 'DECISIONS.md';
  if (!existsSync(join(repository, file))) {
    return { links: [], errors: [`${CONFIG_FILE}: the departures list "${file}" does not exist.`] };
  }
  let text = readFileSync(join(repository, file), 'utf8');
  const errors = [];
  if (config.heading) {
    // Only the section under this heading is the list.
    const lines = text.split('\n');
    const start = lines.findIndex((line) => /^#+ /.test(line) && line.replace(/^#+ /, '').trim() === config.heading);
    if (start === -1) return { links: [], errors: [`${CONFIG_FILE}: "${file}" has no heading "${config.heading}".`] };
    const level = lines[start].match(/^#+/)[0].length;
    const length = lines.slice(start + 1).findIndex((line) => new RegExp(`^#{1,${level}} `).test(line));
    text = lines.slice(start + 1, length === -1 ? undefined : start + 1 + length).join('\n');
  }
  const links = [];
  for (const link of config.entries ?? []) {
    const label = `${CONFIG_FILE}: entry ${link.entry} for ${link.item}`;
    const item = items.get(link.item);
    const entries = [...text.matchAll(new RegExp(`^${Number(link.entry)}\\. (.*)$`, 'gm'))];
    if (!item) errors.push(`${label}: there is no such item.`);
    else if (entries.length === 0) errors.push(`${label}: "${file}" has no entry with that number.`);
    else if (entries.length > 1) errors.push(`${label}: "${file}" has more than one entry with that number. Set "heading".`);
    else if (item.tier === 'Law' && !/^\*\*Aligning \([^)]*#\d+/.test(entries[0][1])) {
      errors.push(`${label}: the item is a law, so the entry must be marked **Aligning** and name an issue.`);
    } else links.push({ entry: Number(link.entry), item: link.item, path: link.path ?? '', used: false });
  }
  // The link with the longest path decides a finding.
  links.sort((a, b) => b.path.length - a.path.length);
  return { links, errors };
}

/** Runs every check on the repository and returns its findings, the ones departures cover and the errors. */
export function checkRepository(repository) {
  const items = readItems();
  let files = listFiles(repository);
  const folders = new Set(files.filter((path) => basename(path) === 'package.json').map((path) => dirname(path)));
  // An application or a package under a `tests/` folder is a fixture, and is not checked.
  const fixtures = [...folders].filter((folder) => `/${folder}/`.includes('/tests/'));
  const roots = [];
  for (const folder of [...folders].sort()) {
    if (fixtures.includes(folder)) continue;
    const prefix = folder === '.' ? '' : `${folder}/`;
    if (files.includes(`${prefix}adonisrc.ts`)) roots.push({ folder, kind: 'application' });
    else {
      const pkg = JSON.parse(readFileSync(join(repository, prefix, 'package.json'), 'utf8'));
      if (DEPENDENCY_LISTS.some((list) => pkg[list]?.['@adonisjs/core'])) roots.push({ folder, kind: 'package' });
    }
  }
  files = files.filter((path) => !fixtures.some((folder) => path.startsWith(`${folder}/`)));
  // A file belongs to the deepest root above it.
  const ownerOf = (path) =>
    roots
      .filter(({ folder }) => folder === '.' || path.startsWith(`${folder}/`))
      .sort((a, b) => b.folder.length - a.folder.length)[0]?.folder;
  const findings = [];
  const add = (id, root, found) => {
    for (const { path, line, message } of found) {
      findings.push({ item: id, tier: items.get(id).tier, path: root.at(path), line, message });
    }
  };
  const top = createRoot(repository, '.', 'repository', files);
  for (const [id, check] of Object.entries(CHECKS)) {
    if (check.repository) {
      // The root of the repository answers. With no `package.json` there, each root answers for itself.
      if (roots.length === 0) continue;
      if (id === 'TOOL-6' || top.has('package.json')) add(id, top, check.run(top));
      else for (const { folder, kind } of roots) {
        const root = createRoot(repository, folder, kind, files);
        add(id, root, check.run(root));
      }
      continue;
    }
    for (const { folder, kind } of roots) {
      if (!check.kinds.includes(kind)) continue;
      const root = createRoot(repository, folder, kind, files.filter((path) => ownerOf(path) === folder));
      add(id, root, check.run(root));
    }
  }
  const { links, errors } = readDepartures(repository, items);
  const open = [];
  const covered = [];
  for (const finding of findings) {
    const link = links.find((candidate) => candidate.item === finding.item && finding.path.startsWith(candidate.path));
    if (link) {
      link.used = true;
      covered.push({ ...finding, entry: link.entry });
    } else open.push(finding);
  }
  for (const link of links.filter((candidate) => !candidate.used)) {
    errors.push(`${CONFIG_FILE}: entry ${link.entry} for ${link.item} covers no finding. Remove the link.`);
  }
  return { roots, open, covered, errors };
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const result = checkRepository(process.cwd());
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    for (const { item, tier, path, line, message } of result.open) {
      console.log(`${item} (${tier}) ${path}${line ? `:${line}` : ''}  ${message}`);
    }
    for (const error of result.errors) console.log(error);
    const itemCount = new Set(result.open.map((finding) => finding.item)).size;
    console.log(
      `\n${result.roots.length} root(s). ${result.open.length} finding(s) in ${itemCount} item(s), ` +
        `${result.covered.length} covered by a departure, ${result.errors.length} error(s).`
    );
  }
  process.exitCode = result.open.length > 0 || result.errors.length > 0 ? 1 : 0;
}
