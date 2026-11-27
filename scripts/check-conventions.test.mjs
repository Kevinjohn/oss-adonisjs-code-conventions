import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { CHECKED_ELSEWHERE, CHECKS, checkRepository, readItems, readManifest } from './check-conventions.mjs';

const json = (value) => JSON.stringify(value);
const APPLICATION = {
  'adonisrc.ts': 'export default {}\n',
  'package.json': json({
    type: 'module',
    prettier: '@adonisjs/prettier-config',
    engines: { node: '>=24.0.0' },
    dependencies: { '@adonisjs/core': '^7.0.0' },
  }),
  'tsconfig.json': '{ "extends": "@adonisjs/tsconfig/tsconfig.app.json" }',
};
const PACKAGE = {
  'package.json': json({
    name: '@acme/adonisjs-thing',
    type: 'module',
    prettier: '@adonisjs/prettier-config',
    engines: { node: '>=24.0.0' },
    files: ['build', '!build/bin', '!build/tests'],
    exports: { '.': './build/index.js' },
    scripts: { test: 'c8 npm run quick:test' },
    peerDependencies: { '@adonisjs/core': '^7.0.0' },
    devDependencies: { '@adonisjs/core': '^7.0.0', 'c8': '^10.0.0' },
  }),
  'tsconfig.json': '{ "extends": "@adonisjs/tsconfig/tsconfig.package.json" }',
};
const packageJson = (base, change) => json({ ...JSON.parse(base['package.json']), ...change });
const command = (body) => `export default class AppReset extends BaseCommand {\n${body}\n}\n`;
const COMMAND = "  static commandName = 'app:reset'\n  static description = 'Resets'";
const migration = (body) =>
  `export default class extends BaseSchema {\n  protected tableName = 'posts'\n  async up() {\n${body}\n  }\n  async down() {}\n}\n`;

// One tree that fails the item and one that passes it. Each is laid over the base of its kind.
const CASES = {
  'NAM-1': { fail: { 'app/services/AvatarService.ts': '' }, pass: { 'app/services/avatar_service.ts': '' } },
  'NAM-3': {
    fail: { 'app/services/avatar_service.ts': 'export default class AvatarService {}\n' },
    pass: { 'app/services/avatar_service.ts': 'export class AvatarService {}\n' },
  },
  'IMP-1': {
    fail: { 'package.json': packageJson(APPLICATION, { type: 'commonjs' }) },
    pass: {},
  },
  'IMP-4': {
    fail: { 'app/services/a_service.ts': "import { b } from './b_service'\n" },
    pass: { 'app/services/a_service.ts': "import { b } from '#services/b_service'\n// from './c'\n" },
  },
  'IMP-5': {
    kind: 'package',
    fail: { 'src/a.ts': "import { b } from './b.js'\n" },
    pass: { 'src/a.ts': "import { b } from './b.ts'\nconst c = () => import('./c.js')\n" },
  },
  'TOOL-2': { fail: { 'package.json': packageJson(APPLICATION, { prettier: { semi: true } }) }, pass: {} },
  'TOOL-3': { fail: { 'tsconfig.json': '{ "extends": "./base.json" }' }, pass: {} },
  'TOOL-4': { fail: { 'package.json': packageJson(APPLICATION, { engines: { node: '>=22' } }) }, pass: {} },
  'TOOL-6': {
    fail: { 'README.md': '' },
    pass: { '.editorconfig': '', '.gitignore': '', '.prettierignore': '', 'README.md': '', 'LICENSE.md': '' },
  },
  'LAY-3': { fail: { 'app/utils/dates.ts': '' }, pass: { 'app/services/billing/dates.ts': '' } },
  'NAM-6': {
    fail: { 'commands/reset.ts': command(COMMAND) },
    pass: { 'commands/app_reset.ts': command(COMMAND) },
  },
  'CFG-2': {
    fail: { 'app/services/a_service.ts': 'const key = process.env.API_KEY\n' },
    pass: { 'bin/test.ts': "process.env.NODE_ENV = 'test'\n", 'config/app.ts': "import env from '#start/env'\n" },
  },
  'CFG-3': {
    fail: { 'app/services/a_service.ts': "if (process.env.NODE_ENV === 'production') {}\n" },
    pass: { 'app/services/a_service.ts': 'if (app.inProduction) {}\n' },
  },
  'CTL-4': {
    fail: { 'app/controllers/posts_controller.ts': 'export default class PostsController {\n  async store(ctx: HttpContext) {}\n}\n' },
    pass: { 'app/controllers/posts_controller.ts': 'export default class PostsController {\n  async store({ request }: HttpContext) {}\n}\n' },
  },
  'CTL-5': {
    fail: { 'app/controllers/posts_controller.ts': 'export default class PostsController {\n  private async load() {}\n}\n' },
    pass: { 'app/controllers/posts_controller.ts': 'export default class PostsController {\n  constructor(protected posts: PostService) {}\n  async index() {}\n}\n' },
  },
  'VAL-2': {
    fail: { 'app/validators/post.ts': 'export const createPost = vine.create({})\n' },
    pass: { 'app/validators/post.ts': 'export const createPostValidator = vine.create({})\n' },
  },
  'VAL-3': {
    fail: {
      'app/validators/post.ts': 'export const createValidator = vine.create({})\n',
      'app/validators/user.ts': 'export const createValidator = vine.create({})\n',
    },
    pass: {
      'app/validators/post.ts': 'export const createPostValidator = vine.create({})\n',
      'app/validators/user.ts': 'export const createUserValidator = vine.create({})\n',
    },
  },
  'VAL-4': {
    fail: { 'app/controllers/posts_controller.ts': 'const data = request.all()\n' },
    pass: {
      'app/controllers/posts_controller.ts':
        'const data = await request.validateUsing(createPostValidator, {\n  data: merge(request.body()),\n})\n',
    },
  },
  'EXC-5': {
    fail: { 'app/exceptions/not_allowed_exception.ts': 'export default class NotAllowedException extends Exception {}\n' },
    pass: { 'app/exceptions/not_allowed_exception.ts': 'export default class NotAllowedException extends Exception {\n  static status = 403\n}\n' },
  },
  'EXC-7': {
    fail: { 'app/exceptions/not_allowed_exception.ts': "export default class NotAllowedException extends Exception {\n  static status = 403\n  static code = 'not_allowed'\n}\n" },
    pass: { 'app/exceptions/not_allowed_exception.ts': "export default class NotAllowedException extends Exception {\n  static status = 403\n  static code = 'E_NOT_ALLOWED'\n}\n" },
  },
  'DB-6': {
    fail: { 'database/migrations/1_create_posts_table.ts': 'export default class extends BaseSchema {\n  async up() {}\n}\n' },
    pass: { 'database/migrations/1_create_posts_table.ts': migration('') },
  },
  'DB-9': {
    fail: { 'database/migrations/1_create_posts_table.ts': migration("    table.integer('user_id').references('id').inTable('users')") },
    pass: {
      'database/migrations/1_create_posts_table.ts': migration(
        "    table\n      .integer('user_id')\n      .references('id')\n      .inTable('users')\n      .onDelete('CASCADE')\n    table.string('title')"
      ),
    },
  },
  'DB-10': {
    fail: { 'config/database.ts': 'export default defineConfig({})\n' },
    pass: { 'config/database.ts': 'export default defineConfig({ migrations: { disableRollbacksInProduction: true } })\n' },
  },
  'SVC-8': {
    fail: { 'app/services/a_service.ts': "console.log('x')\n" },
    pass: { 'app/services/a_service.ts': "logger.info('x')\n" },
  },
  'CMD-1': {
    fail: { 'commands/app_reset.ts': command("  static commandName = 'app:reset'") },
    pass: { 'commands/app_reset.ts': command(COMMAND) },
  },
  'CMD-2': {
    fail: { 'commands/app_db_reset.ts': command("  static commandName = 'app:db:reset'\n  static description = 'Resets'") },
    pass: { 'commands/app_reset.ts': command(COMMAND) },
  },
  'CMD-4': {
    fail: { 'commands/app_reset.ts': command(`${COMMAND}\n  @flags.boolean()\n  declare force: boolean`) },
    pass: { 'commands/app_reset.ts': command(`${COMMAND}\n  @flags.boolean({\n    description: 'Skip the prompt',\n  })\n  declare force: boolean`) },
  },
  'CMD-5': {
    fail: { 'commands/app_reset.ts': command(`${COMMAND}\n  async run() {\n    console.log('done')\n  }`) },
    pass: { 'commands/app_reset.ts': command(`${COMMAND}\n  async run() {\n    this.logger.info('done')\n  }`) },
  },
  'CMD-8': {
    fail: { 'commands/shared.ts': 'export const table = []\n' },
    pass: { 'commands/_shared.ts': 'export const table = []\n' },
  },
  'TST-11': {
    fail: { 'tests/unit/a.spec.ts': "function build() {}\ntest('it works', () => {})\n" },
    pass: { 'tests/unit/a.spec.ts': "test('it works', () => {\n  function build() {}\n})\n" },
  },
  'TST-12': {
    fail: { 'tests/unit/a.spec.ts': "let user\ntest('it works', () => {})\n" },
    pass: { 'tests/unit/a.spec.ts': "test('it works', () => {\n  let user\n})\n" },
  },
  'TST-13': {
    fail: { 'tests/browser/a.spec.ts': "await page.getByText('Save').click()\n" },
    pass: { 'tests/browser/a.spec.ts': "await page.getByText('Save', { exact: true }).click()\nawait page.getByText(/save/i).click()\n" },
  },
  'TST-15': {
    fail: { 'package.json': packageJson(APPLICATION, { dependencies: { '@adonisjs/core': '^7.0.0', '@adonisjs/session': '^8.0.0' } }) },
    pass: {
      'package.json': packageJson(APPLICATION, { dependencies: { '@adonisjs/core': '^7.0.0', '@adonisjs/session': '^8.0.0' } }),
      '.env.test': 'SESSION_DRIVER=memory\n',
    },
  },
  'PKG-1': { kind: 'package', fail: { 'helpers.ts': '' }, pass: { 'index.ts': '', 'configure.ts': '', 'tsdown.config.ts': '' } },
  'PKG-5': { kind: 'package', fail: { 'package.json': packageJson(PACKAGE, { files: ['build'] }) }, pass: {} },
  'PKG-6': {
    kind: 'package',
    fail: { 'src/a.ts': "import db from '@adonisjs/lucid/services/db'\n" },
    pass: { 'src/a.ts': "import app from '@adonisjs/core/services/app'\n" },
  },
  'PKG-7': {
    kind: 'package',
    fail: { 'package.json': packageJson(PACKAGE, { peerDependencies: { '@adonisjs/core': '7.0.0' } }) },
    pass: {},
  },
  'PKG-18': {
    kind: 'package',
    fail: { 'stubs/config/thing.stub': '', 'stubs/main.ts': 'export const stubsRoot = __dirname\n' },
    pass: { 'stubs/config/thing.stub': '', 'stubs/main.ts': 'export const stubsRoot = import.meta.dirname\n' },
  },
  'PKG-23': {
    kind: 'package',
    fail: { 'src/a.ts': 'const key = process.env.THING_KEY\n' },
    pass: { 'bin/test.ts': 'const key = process.env.THING_KEY\n' },
  },
  'PKG-25': {
    kind: 'package',
    fail: { 'providers/thing_provider.ts': 'export default class Provider {}\n' },
    pass: { 'providers/thing_provider.ts': 'export default class ThingProvider {\n  constructor(protected app: ApplicationService) {}\n}\n' },
  },
  'PKG-43': { kind: 'package', fail: { 'package.json': packageJson(PACKAGE, { scripts: { test: 'node bin/test.js' } }) }, pass: {} },
  'PKG-47': {
    kind: 'package',
    fail: { 'src/a.ts': "throw new Error('no')\n" },
    pass: { 'src/a.ts': "throw new RuntimeException('no')\n" },
  },
};

function scratch(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'check-conventions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const itemsFound = (result) => result.open.map((finding) => finding.item);

test('the manifest names every item of the checklist once, and no other', () => {
  const items = readItems();
  const manifest = readManifest();
  assert.deepEqual(Object.keys(manifest), [...items.keys()]);
  for (const [id, how] of Object.entries(manifest)) {
    assert.ok(['lint', 'script', 'both', 'planned', 'model', 'guideline'].includes(how), id);
    assert.equal(how === 'guideline', items.get(id).tier === 'Guideline', id);
  }
});

test('an item is marked "script" or "both" exactly when a script checks it', () => {
  const scripted = Object.entries(readManifest())
    .filter(([, how]) => how === 'script' || how === 'both')
    .map(([id]) => id);
  assert.deepEqual(scripted.sort(), [...Object.keys(CHECKS), ...Object.keys(CHECKED_ELSEWHERE)].sort());
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(CHECKS).sort());
});

for (const [id, { kind = 'application', fail, pass }] of Object.entries(CASES)) {
  const base = kind === 'application' ? APPLICATION : PACKAGE;
  test(`${id} fails on the failing tree and passes on the passing one`, (t) => {
    assert.ok(itemsFound(checkRepository(scratch(t, { ...base, ...fail }))).includes(id), 'fails');
    assert.ok(!itemsFound(checkRepository(scratch(t, { ...base, ...pass }))).includes(id), 'passes');
  });
}

// Shapes a review of the checks found wrong once. `fails` says what the item's text decides.
const SHAPES = [
  ['CFG-2', 'application', false, { 'start/routes.ts': "router.get('/docs/*', () => {})\n/** done */\n" }],
  ['CFG-2', 'application', true, { 'start/routes.ts': "router.get('/docs/*', () => {})\nconst key = process.env.APP_KEY\n/** done */\n" }],
  ['CFG-2', 'application', true, { 'bin/server.ts': 'const { PORT } = process.env\n' }],
  ['IMP-4', 'application', true, { 'commands/app_reset.ts': "import { x } from '../app/services/x.js'\n" }],
  ['IMP-4', 'application', false, { 'commands/app_reset.ts': "import Base from './_base.js'\n" }],
  ['CFG-2', 'application', false, { 'bin/test.ts': "delete process.env[key]\nObject.assign(process.env, { PORT: '1' })\n" }],
  ['DB-9', 'application', true, { 'database/migrations/1_create_posts_table.ts': migration("    t.integer('user_id').references('id').inTable('users').onDelete('CASCADE')\n    t.integer('team_id').references('teams.id')") }],
  ['EXC-5', 'application', true, {
    'app/exceptions/base_exception.ts': 'export default abstract class BaseException extends Exception {\n  static status = 400\n}\n',
    'app/services/billing_service.ts': 'class InvoiceMissing extends BaseException {}\n',
  }],
  ['EXC-5', 'application', false, {
    'app/exceptions/base.ts': 'export default abstract class AppException extends Exception {}\n',
    'app/exceptions/not_found_exception.ts': 'export default class NotFoundException extends AppException {\n  static status = 404\n}\n',
  }],
  ['EXC-7', 'application', true, { 'app/services/a_service.ts': "throw new Exception('x', { code: 'not-found', status: 404 })\n" }],
  ['CFG-3', 'application', false, { 'config/sentry.ts': "export default { environment: env.get('NODE_ENV') }\n" }],
  ['CFG-3', 'application', true, { 'app/services/a_service.ts': "if ('production' !== process.env.NODE_ENV) {}\n" }],
  ['CTL-5', 'application', true, { 'app/controllers/users_controller.ts': 'export default class UsersController {\n  private format = (user: User) => user.name\n}\n' }],
  ['NAM-1', 'application', true, { 'resources/views/components/UserCard.edge': '' }],
  ['NAM-1', 'application', false, { 'inertia/vite-env.d.ts': '' }],
  ['NAM-3', 'application', true, { 'app/services/avatar_service.ts': 'class AvatarService {}\nexport default AvatarService\n' }],
  ['NAM-3', 'package', true, { 'src/errors.ts': 'export default class ThingException extends Exception {}\n' }],
  ['DB-10', 'application', true, { 'config/database.ts': 'export default defineConfig({ connections: {\n  pg: { migrations: { disableRollbacksInProduction: true } },\n  mysql: { migrations: {} },\n} })\n' }],
  ['TST-11', 'application', true, { 'tests/unit/a.spec.ts': "const makeUser = async (\n  name: string,\n  email: string\n) => ({ name, email })\ntest('x', () => {})\n" }],
  ['TST-11', 'application', false, { 'tests/unit/a.spec.ts': "const LIMIT = (2 + 3) * 4\ntest('x', () => {})\n" }],
  ['TST-15', 'application', false, { 'package.json': CASES['TST-15'].pass['package.json'], '.env.test': "SESSION_DRIVER='memory'\n" }],
  ['CMD-1', 'application', false, { 'commands/greet.ts': "export default class extends BaseCommand {\n  static commandName = 'greet'\n  static description = 'Greets'\n}\n" }],
  ['TOOL-2', 'application', false, { 'package.json': packageJson(APPLICATION, { prettier: undefined }), '.prettierrc': '"@adonisjs/prettier-config"\n' }],
  ['PKG-1', 'package', true, { 'lib/thing.ts': 'export const x = 1\n' }],
  ['PKG-6', 'package', false, { 'package.json': packageJson(PACKAGE, { dependencies: { '@adonisjs/presets': '^3.0.0' } }), 'configure.ts': "import { presetLucid } from '@adonisjs/presets/lucid'\n" }],
  ['PKG-7', 'package', true, { 'package.json': packageJson(PACKAGE, { peerDependencies: { '@adonisjs/core': '>=7.0.0' } }) }],
  ['PKG-7', 'package', false, { 'package.json': packageJson(PACKAGE, { peerDependencies: { '@adonisjs/core': '^7.0.0 || ^8.0.0' } }) }],
  ['PKG-43', 'package', false, { 'package.json': packageJson(PACKAGE, { scripts: { test: 'node bin/test.ts', coverage: 'c8 npm test' } }) }],
  ['IMP-5', 'package', true, { 'src/a.ts': "import './b.js'\n" }],
  ['IMP-5', 'package', true, { 'package.json': packageJson(PACKAGE, { imports: { '#src/*': './src/*.js' } }) }],
  ['IMP-1', 'package', false, { 'tests/fixtures/app/adonisrc.ts': '', 'tests/fixtures/app/package.json': json({ type: 'commonjs' }) }],
  // Application source a package holds as text is not the package's code.
  ['IMP-5', 'package', false, { 'configure.ts': "const steps = `import access from '#config/access'\nawait import('#models/user')\n`\n" }],
  ['IMP-5', 'package', false, { 'tests/a.spec.ts': "assert.equal(file, \"import auth from '#middleware/auth_middleware'\")\n" }],
  ['IMP-5', 'package', false, { 'src/a.ts': "const text = `a ${kind ? `x` : ''} import z from '#q'`\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const text = `import x from '#a'`\nimport b from '#c'\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const tick = /`/\nconst load = () => import('#models/user')\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const text = `${await import('#models/user')}`\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const long = /^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$/; const load = () => import('#models/user')\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const has = (text: string) => /`/.test(text)\nconst load = () => import('#models/user')\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const half = total\n  / 2; const load = () => import('#models/user')\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const bare = path.replace(/\\/*$/, '')\nconst load = () => import('#models/user')\n" }],
  ['IMP-5', 'package', true, { 'src/a.ts': "const ratio = (a + b) / 2 / c; const load = () => import('#models/user')\n" }],
  ['IMP-4', 'application', false, { 'app/services/a_service.ts': "export const stub = \"import { b } from './b_service.js'\"\n" }],
  ['NAM-3', 'package', false, { 'src/render.ts': 'export const files = `\nexport default class User {}\n` + `\nexport default class Post {}\n`\n' }],
  ['PKG-6', 'package', false, { 'src/render.ts': "export const config = `import { defineConfig } from '@adonisjs/ally'\n`\n" }],
  ['PKG-6', 'package', true, { 'src/a.ts': "import { defineConfig } from '@adonisjs/ally'\n" }],
  ['PKG-23', 'package', false, { 'src/render.ts': "export const config = `import env from '#start/env'\nconst key = process.env.APP_KEY\n`\n" }],
  ['PKG-23', 'package', true, { 'src/a.ts': "import env from '@adonisjs/core/services/env'\n" }],
  ['PKG-47', 'package', false, { 'src/render.ts': "export const body = \"throw new Error('no')\"\n" }],
  // Documentation tooling and example code are not the package.
  ['PKG-1', 'package', false, { 'docs/.vitepress/config.ts': 'export default {}\n', 'examples/overlay/app/a.ts': 'export const a = 1\n' }],
  ['IMP-5', 'package', false, { 'docs/.vitepress/theme/index.ts': "import Recording from './recording.vue'\n", 'examples/overlay/start/routes.ts': "import router from '#start/kernel'\n" }],
  ['IMP-4', 'application', true, { 'examples/app/package.json': APPLICATION['package.json'], 'examples/app/adonisrc.ts': '', 'examples/app/app/services/a_service.ts': "import { b } from './b_service.js'\n" }],
];
SHAPES.forEach(([id, kind, fails, files], index) => {
  test(`${id} ${fails ? 'fails' : 'passes'} on shape ${index + 1}`, (t) => {
    const base = kind === 'application' ? APPLICATION : PACKAGE;
    assert.equal(itemsFound(checkRepository(scratch(t, { ...base, ...files }))).includes(id), fails);
  });
});

test('with no package.json at the top, the root files are still required and each root answers for Prettier and Node', (t) => {
  const result = checkRepository(scratch(t, { 'server/adonisrc.ts': '', 'server/package.json': json({ type: 'module', dependencies: { '@adonisjs/core': '^7.0.0' } }) }));
  for (const id of ['TOOL-2', 'TOOL-4', 'TOOL-6']) assert.ok(itemsFound(result).includes(id), id);
});

test('a root is checked as its own kind inside a monorepo', (t) => {
  const result = checkRepository(
    scratch(t, {
      'package.json': json({ prettier: '@adonisjs/prettier-config', engines: { node: '>=24' } }),
      ...Object.fromEntries(Object.entries(APPLICATION).map(([path, text]) => [`apps/backend/${path}`, text])),
      'apps/backend/app/controllers/posts_controller.ts': 'export default class PostsController {\n  async store(ctx: HttpContext) {}\n}\n',
      'apps/frontend/package.json': json({ type: 'commonjs' }),
      'apps/frontend/src/App.tsx': 'export function App(ctx: HttpContext) {}\n',
    })
  );
  assert.deepEqual(result.roots, [{ folder: 'apps/backend', kind: 'application' }]);
  assert.deepEqual(
    result.open.filter((finding) => finding.item !== 'TOOL-6').map(({ item, path, line }) => ({ item, path, line })),
    [{ item: 'CTL-4', path: 'apps/backend/app/controllers/posts_controller.ts', line: 2 }]
  );
});

const withDeparture = (entry, link) => ({
  ...APPLICATION,
  ...CASES['TOOL-6'].pass,
  'app/controllers/posts_controller.ts': 'export default class PostsController {\n  async store(ctx: HttpContext) {}\n}\n',
  'DECISIONS.md': `# Departures\n\n${entry}\n`,
  'conventions.config.json': json({ departures: { entries: [link] } }),
});

test('a repository with no application and no package has no findings', (t) => {
  const result = checkRepository(scratch(t, { 'package.json': json({ name: 'docs' }), 'src/App.tsx': '' }));
  assert.deepEqual(result, { roots: [], open: [], covered: [], errors: [] });
});

test('an Aligning entry that names an issue covers a law', (t) => {
  const result = checkRepository(scratch(t, withDeparture('7. **Aligning (#12).** Two actions take the context whole.', { entry: 7, item: 'CTL-4' })));
  assert.deepEqual(result.open, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.covered.map(({ item, entry }) => ({ item, entry })), [{ item: 'CTL-4', entry: 7 }]);
});

test('an entry that is not Aligning does not cover a law', (t) => {
  const result = checkRepository(scratch(t, withDeparture('7. Two actions take the context whole, by choice.', { entry: 7, item: 'CTL-4' })));
  assert.deepEqual(itemsFound(result), ['CTL-4']);
  assert.match(result.errors[0], /must be marked \*\*Aligning\*\*/);
});

test('a link to an entry the list does not have is an error', (t) => {
  const result = checkRepository(scratch(t, withDeparture('7. **Aligning (#12).** Something.', { entry: 8, item: 'CTL-4' })));
  assert.deepEqual(itemsFound(result), ['CTL-4']);
  assert.match(result.errors[0], /no entry with that number/);
});

test('a numbered line outside the departures heading is not an entry', (t) => {
  const files = withDeparture('', { entry: 2, item: 'CTL-4' });
  files['DECISIONS.md'] = '# Setup\n\n1. Clone\n2. Install\n\n# Departures\n\n1. **Aligning (#9).** Something.\n';
  files['conventions.config.json'] = json({ departures: { heading: 'Departures', entries: [{ entry: 2, item: 'CTL-4' }] } });
  const result = checkRepository(scratch(t, files));
  assert.deepEqual(itemsFound(result), ['CTL-4']);
  assert.match(result.errors[0], /no entry with that number/);
});

test('a missing departures list covers nothing', (t) => {
  const files = withDeparture('', { entry: 7, item: 'CTL-4' });
  delete files['DECISIONS.md'];
  const result = checkRepository(scratch(t, files));
  assert.deepEqual(itemsFound(result), ['CTL-4']);
  assert.match(result.errors[0], /does not exist/);
});

test('a link that covers no finding is an error', (t) => {
  const result = checkRepository(scratch(t, withDeparture('7. **Aligning (#12).** Something.', { entry: 7, item: 'CTL-5' })));
  assert.match(result.errors[0], /covers no finding/);
});
