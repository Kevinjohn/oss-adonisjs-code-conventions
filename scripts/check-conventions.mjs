#!/usr/bin/env node
// Checks the checklist items that have one right answer, the ones `adonisjs/checks.json` marks
// "script". The same tree gives the same findings on every run.
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
//       "entries": [{ "entry": 28, "item": "TOOL-2" }, { "entry": 33, "item": "CTL-4", "path": "apps/backend/app/controllers/" }]
//     }
//   }
//
// The entry must exist in the file as a numbered list entry. For a law it must be marked
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

/** How each item is checked: lint, script, planned, model or guideline. */
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
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, (line, before) => before);
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const pascal = (name) =>
  name
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

/** The text of a call from its opening parenthesis to the one that closes it. */
function callText(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')' && --depth === 0) return text.slice(open, index + 1);
  }
  return text.slice(open);
}

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
      for (const path of root.files.filter((file) => SOURCE.test(file))) {
        const parts = path.split('/');
        const file = parts.pop();
        if (!/^_?[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(file)) {
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
      const paths = root.files.filter(
        (path) =>
          SOURCE.test(path) &&
          !path.endsWith('.d.ts') &&
          !path.startsWith('tests/') &&
          !path.startsWith('inertia/') &&
          !(root.kind === 'package' && path === 'src/errors.ts')
      );
      for (const path of paths) {
        const code = root.code(path);
        const classes = [...code.matchAll(CLASS)];
        if (classes.length > 1) {
          found.push({ path, line: lineOf(code, classes[1].index), message: 'The file holds more than one class.' });
        }
        const wantsDefault = DEFAULT_EXPORT_FOLDERS.some((folder) => path.startsWith(folder));
        const wantsNamed = root.kind === 'application' && path.startsWith('app/services/');
        for (const [, exported, isDefault] of classes.slice(0, 1)) {
          if (!exported) continue;
          if (wantsDefault && !isDefault) {
            found.push({ path, line: lineOf(code, classes[0].index), message: 'The class is a named export; its folder takes a default export.' });
          }
          if (wantsNamed && isDefault) {
            found.push({ path, line: lineOf(code, classes[0].index), message: 'The service is a default export; a service is a named export.' });
          }
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
    run: (root) =>
      matches(
        root,
        root.source('app/', 'start/', 'config/', 'providers/'),
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]\.\.?\//g,
        'A relative import; an application imports through a `#` alias.'
      ),
  },
  'IMP-5': {
    kinds: ['package'],
    run(root) {
      const found = [];
      for (const path of root.files.filter((file) => SOURCE.test(file) && !file.endsWith('.d.ts'))) {
        const code = root.code(path);
        for (const match of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
          const line = lineOf(code, match.index);
          if (match[1].startsWith('#')) found.push({ path, line, message: 'A `#` alias; a package imports by relative path.' });
          else if (match[1].startsWith('.') && !match[1].endsWith('.ts')) {
            found.push({ path, line, message: 'A static relative import that does not end in `.ts`.' });
          }
        }
        if (path.startsWith('tests/')) continue;
        for (const match of code.matchAll(/\bimport\s*\(\s*['"](\.[^'"]*)['"]/g)) {
          if (!match[1].endsWith('.js')) {
            found.push({ path, line: lineOf(code, match.index), message: 'A lazy relative `import()` that does not end in `.js`.' });
          }
        }
      }
      return found;
    },
  },
  'TOOL-2': {
    repository: true,
    run: (root) =>
      root.json('package.json').prettier === '@adonisjs/prettier-config'
        ? []
        : [{ path: 'package.json', line: null, message: '`"prettier"` is not `"@adonisjs/prettier-config"`.' }],
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
      ...matches(
        root,
        root.source('bin/'),
        /process\.env(?:\.\w+\b|\[[^\]]+\])(?!\s*=(?!=))/g,
        'A `bin/` entry point reads a variable from `process.env`.'
      ),
    ],
  },
  'CFG-3': {
    kinds: ['application'],
    run: (root) =>
      matches(
        root,
        root.source(...APP_CODE, 'config/').filter((path) => path !== 'start/env.ts'),
        /env\.get\(\s*['"]NODE_ENV['"]|NODE_ENV['"\])]*\s*[!=]==?/g,
        'Reads or compares `NODE_ENV`; ask `app.inProduction`, `app.inDev` or `app.inTest`.'
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
        /^[ \t]*(?:(?:private|protected)\s+(?:static\s+)?(?:async\s+)?\*?\w+\s*[(<]|(?:static\s+)?(?:async\s+)?#\w+\s*\()/gm,
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
      const app = root.source('app/');
      const extendedSomewhere = new Set(
        app.flatMap((path) => [...root.code(path).matchAll(/\bextends\s+(\w+)/g)].map((match) => match[1]))
      );
      for (const path of app) {
        const code = root.code(path);
        const inFolder = path.startsWith('app/exceptions/');
        for (const match of code.matchAll(/class\s+(\w+)\s+extends\s+(\w+)/g)) {
          const line = lineOf(code, match.index);
          if (match[2] === 'Error') found.push({ path, line, message: 'The class extends `Error`, not `Exception`.' });
          if (match[2] !== 'Exception') continue;
          if (!inFolder || !path.endsWith('_exception.ts')) {
            found.push({ path, line, message: 'An exception lives in `app/exceptions/<name>_exception.ts`.' });
          }
          if (!/\bstatic\s+(?:readonly\s+)?status\b/.test(code) && !extendedSomewhere.has(match[1])) {
            found.push({ path, line, message: 'The exception sets no `static status`.' });
          }
        }
      }
      return found;
    },
  },
  'EXC-7': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const path of root.source('app/exceptions/')) {
        const code = root.code(path);
        for (const match of code.matchAll(/\bstatic\s+(?:readonly\s+)?code\s*=\s*['"]([^'"]+)['"]/g)) {
          if (!/^E_[A-Z0-9_]+$/.test(match[1])) {
            found.push({ path, line: lineOf(code, match.index), message: `The code \`${match[1]}\` is not \`E_UPPER_SNAKE\`.` });
          }
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
          const start = Math.max(code.lastIndexOf('table.', match.index), 0);
          const rest = code.slice(match.index);
          const end = rest.search(/\n\s*(?:table\.|\}\))/);
          const statement = code.slice(start, end === -1 ? code.length : match.index + end);
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
    run: (root) =>
      !root.has('config/database.ts') || /disableRollbacksInProduction\s*:\s*true/.test(root.code('config/database.ts'))
        ? []
        : [{ path: 'config/database.ts', line: null, message: '`disableRollbacksInProduction: true` is not set.' }],
  },
  'SVC-8': {
    kinds: ['application'],
    run: (root) => matches(root, root.source('app/', 'providers/', 'start/'), CONSOLE, 'Writes to `console`; log through the logger.'),
  },
  'CMD-1': {
    kinds: ['application'],
    run(root) {
      const found = [];
      for (const { path, code, name, line } of commandFiles(root)) {
        if (!name) continue;
        if (!/^export default class \w+ extends \w+/m.test(code)) {
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
      const specs = root.source('tests/').filter((path) => path.endsWith('.spec.ts') && /\btest(?:\.group)?\(/.test(root.code(path)));
      return matches(
        root,
        specs,
        /^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*\w+|(?:abstract\s+)?class\s+\w+|const\s+\w+\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\([^)\n]*\)\s*(?::[^=\n]+)?=>|\w+\s*=>))/gm,
        'A function or class declared at the top level of a test file.'
      );
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
      return root.has('.env.test') && /^SESSION_DRIVER=memory\s*$/m.test(root.read('.env.test'))
        ? []
        : [{ path: '.env.test', line: null, message: '`SESSION_DRIVER=memory` is not set.' }];
    },
  },
  'PKG-1': {
    kinds: ['package'],
    run: (root) =>
      root.files
        .filter((path) => !path.includes('/') && SOURCE.test(path) && !path.endsWith('.d.ts'))
        .filter((path) => !['index.ts', 'configure.ts'].includes(path) && !/\.config\.m?ts$/.test(path))
        .map((path) => ({ path, line: null, message: 'A source file at the package root that is not `index.ts` or `configure.ts`.' })),
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
        .filter((name) => name.startsWith('@adonisjs/'))
        .map((name) => ({ path: 'package.json', line: null, message: `\`${name}\` is under \`dependencies\`.` }));
      const imported = new Set();
      for (const path of root.source(...SHIPPED)) {
        for (const match of root.code(path).matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](@adonisjs\/[^/'"]+)/g)) {
          imported.add(match[1]);
        }
      }
      imported.delete(pkg.name);
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
        .filter(([, range]) => /^=?\s*\d+\.\d+\.\d+/.test(range))
        .map(([name, range]) => ({ path: 'package.json', line: null, message: `The peer \`${name}\` is pinned to \`${range}\`.` })),
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
      return pkg.devDependencies?.c8 && /\bc8\b/.test(pkg.scripts?.test ?? '')
        ? []
        : [{ path: 'package.json', line: null, message: 'The `test` script does not collect coverage with `c8`.' }];
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
  const errors = [];
  const file = config.file ?? 'DECISIONS.md';
  const text = existsSync(join(repository, file)) ? readFileSync(join(repository, file), 'utf8') : null;
  if (text === null) errors.push(`${CONFIG_FILE}: the departures list "${file}" does not exist.`);
  const links = [];
  for (const link of config.entries ?? []) {
    const label = `${CONFIG_FILE}: entry ${link.entry} for ${link.item}`;
    const item = items.get(link.item);
    if (!item) {
      errors.push(`${label}: there is no such item.`);
      continue;
    }
    const entry = text?.match(new RegExp(`^${Number(link.entry)}\\. (.*)$`, 'm'));
    if (text !== null && !entry) {
      errors.push(`${label}: "${file}" has no entry with that number.`);
      continue;
    }
    if (entry && item.tier === 'Law' && !/^\*\*Aligning \([^)]*#\d+/.test(entry[1])) {
      errors.push(`${label}: the item is a law, so the entry must be marked **Aligning** and name an issue.`);
      continue;
    }
    links.push({ entry: Number(link.entry), item: link.item, path: link.path ?? '', used: false });
  }
  return { links, errors };
}

/** Runs every check on the repository and returns its findings, the ones departures cover and the errors. */
export function checkRepository(repository) {
  const items = readItems();
  const files = listFiles(repository);
  const folders = new Set(files.filter((path) => basename(path) === 'package.json').map((path) => dirname(path)));
  const roots = [];
  for (const folder of [...folders].sort()) {
    const prefix = folder === '.' ? '' : `${folder}/`;
    if (files.includes(`${prefix}adonisrc.ts`)) roots.push({ folder, kind: 'application' });
    else {
      const pkg = JSON.parse(readFileSync(join(repository, prefix, 'package.json'), 'utf8'));
      if (DEPENDENCY_LISTS.some((list) => pkg[list]?.['@adonisjs/core'])) roots.push({ folder, kind: 'package' });
    }
  }
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
      if (roots.length > 0 && top.has('package.json')) add(id, top, check.run(top));
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
