# AdonisJS pre-PR checklist

Draft 13, 2026-11-26. The working half of the [AdonisJS cookbook](./cookbook.md): every
rule in it, as a check. The cookbook holds the reasons, the origin of each rule, the vocabulary
table and the recipes. The rule id is the same in both; the tier and the wording that is checked
are here.

## How to use it

1. Run it before a pull request is opened, on the whole diff, not from memory.
2. Section 1 applies to every change. After that, do each section whose heading matches a file the
   diff touches. Applications use section 2, packages section 3.
   Sections 2 and 3 cover server code. Frontend code is what a bundler builds for the browser: the
   `inertia/` folder of an application, or a separate package in a monorepo. The `inertia/` folder
   is covered by section 1 and by "The frontend API client". A separate frontend package is covered
   by "Vocabulary", "Lint, format and TypeScript" and "The frontend API client", and by nothing
   else: the monorepo starter kit ships `apps/frontend` empty, for the framework of your choice.
   A test file is covered by section 1 and by "Tests" (in a package, "Tests and release"), and by
   nothing else: the other sections check the code the application or the package runs. A test file
   of a separate frontend package is covered by "Vocabulary" and "Lint, format and TypeScript".
3. Every law and rule ends as one of: **pass**; **n/a**, with the reason; or, for a rule only,
   **departure**, citing the numbered entry in the repository's departures list. A failed item is
   fixed before the pull request. There is no fourth state.
4. Run the mechanical checks first. They are the commands at the head of a section. A check points
   at lines to read; the item decides. Output the change caused is a failure unless the item passes on it. Output that
   the same check gives on the base branch, or that a numbered departure covers, goes under
   "exceptions" in the summary block, with its path or its departure number.
5. Paste the summary block at the end into the pull request description.
6. Code the diff did not touch is not in scope. A failure seen there gets an issue.

The tiers (law, rule, guideline), when **n/a** is valid, how a departure is decided and how a
review runs are in [How to use these conventions](../workflow.md).

---

# 1. Every change


## Vocabulary

*When:* Every change.

Mechanical checks:

- [ ] `check-terminology` (`scripts/check-terminology.mjs` in the conventions repository, run from the repository root) prints no rejected synonym

Items:

- [ ] **VOC-1** (Rule) Use the framework's word for a framework concept, in code, comments, commit messages, issues and documentation. A framework word names the framework's operation only: `logout` ends the current session, and ending another session or a token is not a logout. A name is checked where it is declared, not at each use.
- [ ] **VOC-2** (Law) Write "AdonisJS", never "Adonis", in prose. Package names keep their spelling: Lucid, VineJS, Japa, Tuyau, Ace, Edge, Bouncer, Shield. An identifier, a third-party name and a quotation of the rejected spelling keep theirs. A test title is prose.
- [ ] **VOC-3** (Rule) A word in the [cookbook's vocabulary table](./cookbook.md#vocabulary) is not reused for anything else. Pick a different word for a product concept that happens to resemble one. The item covers a name the repository coins. The framework's own other uses of a word (a route group) and another library's term (a Prisma model, a TypeScript type guard) are not reuse. In a compound name the word counts only when it is the noun that names the thing. The item is checked in server code, on a name where it is declared: an exported identifier, a file name, a route name, a table or a column. Prose, a local variable and a parameter are not checked. Frontend code is not checked: its framework has words of its own (a store action, an event listener).

## Names

*When:* Every change.

- [ ] **NAM-1** (Law) Files and folders are `snake_case`. The official ESLint preset enforces it with `@unicorn/filename-case`. A name a tool or a platform prescribes (`README.md`, `LICENSE`, a tool's configuration file) keeps its spelling. Documentation and asset files are not covered.
- [ ] **NAM-2** (Law) Classes and types are PascalCase. Interfaces have no `I` prefix. Variables and functions are camelCase; constants may be UPPER_CASE. A variable that holds a class is PascalCase: `const { default: User } = await import('#models/user')`. A React component, and a variable that holds one, is PascalCase, as the React starter kit exports `Login` from `inertia/pages/auth/login.tsx`.
- [ ] **NAM-3** (Law) A file that holds a class holds one class, and exports it as the generator does: a default export for a controller, model, middleware, exception, event, listener, mail, policy, transformer, provider, seeder and command; a named export for a service (`export class AvatarService`). Validators, factories and config helpers are named exports. In a package, `src/errors.ts` holds every exception class as a named export (PKG-31). The kit's `providers/api_provider.ts` holds a serializer class and exports nothing, and passes. A class declared inside a test or a test group is not checked, as `@adonisjs/core` declares them in `tests/helpers.spec.ts`.
- [ ] **NAM-4** (Guideline) Create a file with its generator (`node ace make:*`), so the name, suffix and folder are the framework's.

## Imports and modules

*When:* Every change.

Mechanical checks:

- [ ] `grep -rnE "from '\.\.?/" app start config providers 2>/dev/null` prints nothing in an application (IMP-4)

Items:

- [ ] **IMP-1** (Law) ES modules only: `"type": "module"`, `import`, top-level `await`.
- [ ] **IMP-2** (Law) Import a type with `import type`, or the inline form `import { type X }`.
- [ ] **IMP-3** (Law) Use the `node:` prefix for Node built-ins.
- [ ] **IMP-4** (Law) In an application, import across folders through the `#` subpath aliases declared under `imports` in `package.json`. Do not write relative imports. Frontend code a bundler builds is not checked: the React starter kit imports relatively and through a `~/` alias under `inertia/`.
- [ ] **IMP-5** (Law) In a package, a static import is a relative path that ends in `.ts`; a lazy `import()` of a built module ends in `.js`. Packages declare no `#` aliases, as the official packages do not. A re-export (`export … from`) is a static import.
- [ ] **IMP-6** (Rule) Import a container service from its `services` path. Do not construct what a package already provides.

## Lint, format and TypeScript

*When:* Every change.

Mechanical checks:

- [ ] the `lint` and `typecheck` scripts pass, and `format` leaves no diff

Items:

- [ ] **TOOL-1** (Law) ESLint starts from `@adonisjs/eslint-config`: `configApp()` in an application, `configPkg()` in a package. Add rules; do not remove the preset's. This item checks the config file. A `// eslint-disable-next-line` comment that names its rule passes, as `@adonisjs/bodyparser` has one in `src/parsers/json.ts`. A directive that covers a whole file, or names no rule, removes the preset's rules and fails, whatever comment explains it. Frontend code inside the application is linted by the same config with the preset's framework rules, as the React starter kit has `configApp(...react)`. A separate frontend package in a monorepo chooses its own ESLint config, as the monorepo starter kit leaves `apps/frontend` empty. Its directives are not checked by this item: there is no preset whose rules they remove.
- [ ] **TOOL-2** (Rule) Prettier starts from `@adonisjs/prettier-config`: single quotes, 100 columns, ES5 trailing commas, `arrowParens: always`, `quoteProps: consistent`, no semicolons. In a monorepo the root `package.json` declares it for every package, the frontend included, as the monorepo starter kit does.
- [ ] **TOOL-3** (Law) `tsconfig.json` extends `@adonisjs/tsconfig/tsconfig.app.json` in an application and `@adonisjs/tsconfig/tsconfig.package.json` in a package. Frontend code inside the application extends `@adonisjs/tsconfig/tsconfig.client.json`, as the React starter kit does in `inertia/tsconfig.json`. A separate frontend package in a monorepo chooses its own.
- [ ] **TOOL-4** (Law) Node is version 24 or later, declared under `engines`. The framework requires it; the package starter kit declares it. In a workspace the root `package.json` declares it, as the monorepo starter kit does.
- [ ] **TOOL-5** (Rule) Script names are the starter kit's: `dev`, `build`, `start`, `test`, `lint`, `format`, `typecheck`, plus `codegen` in a monorepo backend and `compile`, `quick:test` and `release` in a package. A script outside this list may be added. A package has no `dev` and no `start`, as the package starter kit has none.
- [ ] **TOOL-6** (Law) The repository root has `.editorconfig`, `.gitignore`, `.prettierignore`, `README.md` and `LICENSE.md`. The kits ship the first four.
- [ ] **TOOL-7** (Guideline) Return early. Check each condition that ends the work at the top of the function; do not wrap the main logic in an `if`.
- [ ] **TOOL-8** (Law) Private state in a class is a `#field` or `#method`. Use `protected` only for a member a subclass or the framework reads. A `protected` member no subclass in the repository reads needs the class documented as one to extend. A provider's `constructor(protected app: ApplicationService)`, as `make:provider` writes it, passes.

---

# 2. Applications


## Layout

*When:* You added, moved or renamed a file.

- [ ] **LAY-1** (Rule) A new kind of file goes in the framework's folder for it. Create the folder when the first file needs it and add its `#` alias in the same change.
- [ ] **LAY-2** (Rule) A framework folder holds only its own kind of file. `app/models` holds models. `start/` holds `env.ts` and files imported while the application boots. `bin/` holds the entry points.
- [ ] **LAY-3** (Law) No catch-all folders (`utils/`, `helpers/`, `lib/`) under `app/`. Group by domain inside a framework folder: `app/services/billing/`.
- [ ] **LAY-4** (Law) `.adonisjs/` and `database/schema.ts` are generated. Never edit them. Regenerate with `node ace codegen` and with a migration run.
- [ ] **LAY-5** (Law) `ace.js` is not modified. Code that must run before Ace goes in `bin/console.ts`.
- [ ] **LAY-6** (Rule) In a monorepo the backend is `apps/backend` and the frontend `apps/frontend`. The frontend imports only what the backend exports: `./registry` and `./data`.

## File and class names

*When:* You added, moved or renamed a file.

- [ ] **NAM-5** (Rule) `make:controller` pluralizes the name. Pass `--singular` for a controller over one thing.
- [ ] **NAM-6** (Law) A namespaced command's file mirrors its whole name: `app:reset` lives in `commands/app_reset.ts` and exports `AppReset`.

## Configuration and environment

*When:* You touched `config/`, `start/env.ts`, `.env*` or `adonisrc.ts`.

Mechanical checks:

- [ ] `grep -rnE "process\.env|#start/env" app providers 2>/dev/null` prints nothing (CFG-2)
- [ ] `grep -rnE "from '#(services|models|controllers)/" config` prints nothing (CFG-4)
- [ ] every key in `start/env.ts` is in `.env.example`

Items:

- [ ] **CFG-1** (Law) Every environment variable is declared and validated in `start/env.ts`. A secret uses `Env.schema.secret()`.
- [ ] **CFG-2** (Law) Only `config/` files read the `env` service. Controllers, middleware, services and models read configuration, never `env` and never `process.env`. Setting `process.env.NODE_ENV` in a `bin/` entry point, as the generated `bin/test.ts` does, is not reading it. A `bin/` entry point reads no variable from `process.env`.
- [ ] **CFG-3** (Law) Ask the application for its state with `app.inProduction`, `app.inDev` and `app.inTest`. Do not compare `NODE_ENV`.
- [ ] **CFG-4** (Rule) A `config/` file imports `env`, framework helpers and the package's `defineConfig`, and default-exports the result. It does not import application code. A value exported by name, as `appUrl` and `http` are in the kit's `config/app.ts`, needs no default export.
- [ ] **CFG-5** (Law) A config file that defines a named list (mailers, hash drivers, limiter stores, guards) carries the `declare module` block that types it.
- [ ] **CFG-6** (Law) `adonisrc.ts` is environment-agnostic: no `process.env`, no logic. `providers`, `preloads` and `commands` are lazy imports. A provider or preload that belongs to some environments says so with `{ file, environment }`.
- [ ] **CFG-7** (Law) Resolve paths with `app.makePath()`, `app.publicPath()`, `app.tmpPath()` and `app.configPath()`. A `bin/` entry point runs before `app` exists and resolves from `import.meta.url`, as the generated `APP_ROOT` does.
- [ ] **CFG-8** (Law) `.env.example` lists every variable with a placeholder, never a real secret. Values for tests are in `.env.test`.
- [ ] **CFG-9** (Rule) A product's own variables share one prefix (`MYAPP_`). Framework variables keep the framework's names (`APP_KEY`, `PORT`, `HOST`, `LOG_LEVEL`).
- [ ] **CFG-10** (Guideline) Add a variable with `node ace env:add`, which writes `.env`, `.env.example` and the `start/env.ts` validation together.
- [ ] **CFG-11** (Law) `adonisrc.ts` keeps `indexEntities(...)` and, for a typed client, `generateRegistry()` in `hooks.init`.

## Routes

*When:* You touched a routes file.

Mechanical checks:

- [ ] `grep -rnE "from '#controllers/" start` prints nothing (RTE-2)
- [ ] in `node ace list:routes`, every route with a controller has a name

Items:

- [ ] **RTE-1** (Rule) A routes file only maps: path, controller action, middleware, name.
- [ ] **RTE-2** (Law) A route points at a controller through the barrel file: `[controllers.Posts, 'index']`, with `import { controllers } from '#generated/controllers'`. A static controller import in a routes file breaks hot reload and is a lint error (`@adonisjs/prefer-lazy-controller-import`).
- [ ] **RTE-3** (Law) A route with a controller is named by the framework: `<controller_snake>.<method>` (`posts.index`), prefixed by any group `.as()` (`auth.new_account.store`); a single action controller is named `<controller_snake>` alone. Name a route by hand only when it has no controller.
- [ ] **RTE-4** (Rule) A shared path prefix, middleware or name prefix goes on a `router.group()` with `.prefix()`, `.use()` and `.as()`. Do not repeat it on every route.
- [ ] **RTE-5** (Law) Attach middleware with `.use(middleware.name(options))`, importing `middleware` from `#start/kernel`.
- [ ] **RTE-6** (Rule) Use `router.resource()` for a resource with the standard actions, and `.apiOnly()` for an API.
- [ ] **RTE-7** (Guideline) The verb says what the route does: `GET` reads, `POST` creates or acts, `PUT` replaces, `PATCH` changes part, `DELETE` removes.
- [ ] **RTE-8** (Guideline) Constrain a route parameter with `.where()` or `router.matchers`.
- [ ] **RTE-9** (Rule) An API is versioned in the outer group's prefix: `/api/v1`.
- [ ] **RTE-10** (Guideline) When `start/routes.ts` grows past one screen, split it by area into `start/routes/<area>.ts` files that `start/routes.ts` imports. Each stays a plain route file.

## Controllers

*When:* You touched a controller.

Mechanical checks:

- [ ] `grep -rnE "^\s*(private|protected) " app/controllers` prints nothing (CTL-5)
- [ ] `grep -rnE "\((ctx|context): HttpContext\)" app/controllers` prints nothing (CTL-4)
- [ ] `grep -rn "try {" app/controllers` prints nothing (CTL-6)

Items:

- [ ] **CTL-1** (Guideline) A controller maps HTTP to the application: validate, do the work or call a service, return the result.
- [ ] **CTL-2** (Rule) One controller per resource. Its actions are the resourceful names: `index`, `show`, `store`, `update`, `destroy` (and `create` and `edit` when it renders forms).
- [ ] **CTL-3** (Rule) An operation that is not one of those becomes its own controller: a noun controller with a resourceful action (the kit: sign-up is `NewAccountController.store`, login and logout are `AccessTokensController.store` and `.destroy`), or a single action controller with one `handle` method, made with `node ace make:controller <name> handle --singular` (the documentation). Do not grow a controller into a list of verbs.
- [ ] **CTL-4** (Law) An action destructures what it uses from the HTTP context: `async store({ request, serialize }: HttpContext)`.
- [ ] **CTL-5** (Law) A controller has no `private` or `protected` method. A step two actions share moves to a service or the model.
- [ ] **CTL-6** (Law) A controller does not catch an exception to answer with an error, which is a status of 400 or above. The exception reaches the exception handler. A `catch` that recovers and goes on to the action's normal answer is not covered.
- [ ] **CTL-7** (Rule) Return a value, or use the response helper that names the status: `response.created()`, `response.notFound()`, `response.forbidden()`. `response.send()` with no status set counts as a returned value. Do not set a status by number (`response.status(404)`).
- [ ] **CTL-8** (Law) A class the container builds, such as a service, comes through the constructor with `@inject()`, or as an action argument with `@inject()` on the action. A container service, which is an instance a `services` path exports, is imported, not injected (IMP-6). A class with no such export is injected.
- [ ] **CTL-9** (Guideline) Business rules that a command, a listener or a second controller also needs live in a service, not in the action.
- [ ] **CTL-10** (Guideline) Create a resource controller with `node ace make:controller <name> --resource` (or `--api`), and its validators with `node ace make:validator <name> --resource`.

## Validators

*When:* You touched a validator or an action that reads input.

Mechanical checks:

- [ ] `grep -rnE "request\.(all|body|qs|input|only|except)\(" app` prints nothing (VAL-4)
- [ ] `grep -rhoE "export const \w+" app/validators | sort | uniq -d` prints nothing (VAL-3)

Items:

- [ ] **VAL-1** (Law) A validator is `vine.create({ ... })`, exported by name from `app/validators/<resource>.ts`. One file holds every validator for its resource.
- [ ] **VAL-2** (Law) The export ends in `Validator`: `signupValidator`, `createPostValidator`, `updatePostValidator`.
- [ ] **VAL-3** (Law) A validator's name is unique across the application.
- [ ] **VAL-4** (Rule) Validate with `request.validateUsing(validator)` as the first step of the action. Nothing reads `request.body()`, `request.all()`, `request.qs()`, `request.input()`, `request.only()` or `request.except()` unvalidated. The framework allows it; we do not.
- [ ] **VAL-5** (Rule) When an action uses route parameters, headers or cookies, they are validated in the same validator, under its `params`, `headers` and `cookies` keys.
- [ ] **VAL-6** (Law) Do not wrap `validateUsing` in `try`/`catch`. Use `request.tryValidateUsing` when the action must handle the failure itself.
- [ ] **VAL-7** (Rule) Database rules (`unique`, `exists`) belong in the validator.
- [ ] **VAL-8** (Law) Global VineJS setup (messages, custom rules) is in the `start/validator.ts` preload file.
- [ ] **VAL-9** (Guideline) Small helpers that build a shared field sit at the top of the validator file.
- [ ] **VAL-10** (Rule) A rule that depends on the request, such as unique-except-self, takes the value through `withMetaData<T>()` and `validateUsing(validator, { meta })`.

## Middleware

*When:* You touched middleware or `start/kernel.ts`.

- [ ] **MID-1** (Law) `start/kernel.ts` registers three stacks, each with lazy imports: server middleware (every request, including one with no route), router middleware (every request that matches a route) and named middleware (only routes that ask for it), exported as `middleware`.
- [ ] **MID-2** (Rule) Body parsing, session, Shield and `initialize_auth` are router middleware. CORS, forced JSON and container bindings are server middleware.
- [ ] **MID-3** (Law) A middleware is a class with `handle(ctx, next, options?)`. Code before `await next()` runs on the way in; code after it runs on the way out.
- [ ] **MID-4** (Law) A middleware refuses by throwing an exception, or by sending a response and not calling `next`.
- [ ] **MID-5** (Law) What a route requires is named middleware on that route or its group. Router middleware does not branch on the route's name or path.
- [ ] **MID-6** (Law) A middleware that adds a property to `HttpContext` carries the `declare module '@adonisjs/core/http'` block in the same file.

## Exceptions

*When:* You throw, catch or handle an error.

Mechanical checks:

- [ ] `grep -rnE "extends Error\b|throw new Error\(" app` prints nothing (EXC-5, EXC-9)
- [ ] `ls app/exceptions` shows only `handler.ts` and `*_exception.ts` (LAY-2, EXC-5)

Items:

- [ ] **EXC-1** (Law) `app/exceptions/handler.ts` holds one `HttpExceptionHandler` that extends `ExceptionHandler`, registered with `server.errorHandler` in `start/kernel.ts`.
- [ ] **EXC-2** (Law) `handle` turns an exception into a response; `report` logs it and never sends one. `handle` falls through to `super.handle` for anything it does not answer itself. A custom `report` calls `super.report`, or checks `this.shouldReport(...)` first.
- [ ] **EXC-3** (Rule) Debug output is on outside production: `protected debug = !app.inProduction`.
- [ ] **EXC-4** (Guideline) Expected errors are kept out of the log with `ignoreCodes` and `ignoreStatuses`.
- [ ] **EXC-5** (Law) A custom exception extends `Exception` from `@adonisjs/core/exceptions`, lives in `app/exceptions/<name>_exception.ts`, and sets `static status`. It sets `static code` when a client or a handler matches on it.
- [ ] **EXC-6** (Guideline) An exception that needs its own response or log line implements `handle` and `report` on itself (framework option). We prefer that to an `instanceof` branch per exception in the handler.
- [ ] **EXC-7** (Rule) Exception codes are `E_UPPER_SNAKE`.
- [ ] **EXC-8** (Law) Recognise a framework error with `instanceof` on its package's `errors` export (`errors.E_VALIDATION_ERROR`, `errors.E_ROUTE_NOT_FOUND`), never by its message.
- [ ] **EXC-9** (Rule) Application code throws exceptions, never a bare `Error`, for anything a client can cause.
- [ ] **EXC-10** (Rule) One exception class per cause. `static status`, `static code` and, when the sentence never varies, `static message` say what it is. No constructor takes a status or a code; it takes only what the message or the response needs (an id, a detail sentence, `{ cause }`).

## Responses and transformers

*When:* You changed what an endpoint returns.

- [ ] **RES-1** (Law) Never return a Lucid model from an action. Return a transformer result or a plain object.
- [ ] **RES-2** (Rule) A transformer extends `BaseTransformer<T>` and implements `toObject()`. Pick fields with `this.pick(this.resource, [...])`.
- [ ] **RES-3** (Law) A transformer runs no query. Load relationships with `preload()` first.
- [ ] **RES-4** (Rule) An API answers with `serialize(Transformer.transform(model))`, which wraps the result in `{ data }`. The `serialize` helper is added to the HTTP context by `providers/api_provider.ts`, as in the kit.
- [ ] **RES-5** (Rule) A paginated list is `serialize(Transformer.paginate(...))`, so the metadata has the framework's shape.
- [ ] **RES-6** (Rule) A transformer shapes output. Input is described by a validator.
- [ ] **RES-7** (Rule) Wire field names are camelCase; columns are `snake_case`.
- [ ] **RES-8** (Rule) A second shape for the same model is a transformer variant: a `for<Purpose>()` method chosen with `.useVariant()`. It is not a second transformer class.
- [ ] **RES-9** (Rule) An answer that must not be wrapped uses `serialize.withoutWrapping(...)`.

## Models and the database

*When:* You touched a model, a query, a transaction or a migration.

Mechanical checks:

- [ ] `grep -rL "async down" database/migrations` prints nothing
- [ ] every `@column` in `app/models` refines one column (MOD-2)
- [ ] `git diff --name-status origin/main -- database/migrations` shows only `A` lines

Items:

- [ ] **MOD-1** (Law) One model per table, singular PascalCase, in `app/models/<singular>.ts`. The table is the plural `snake_case` name; set `static table` only when it is not.
- [ ] **MOD-2** (Rule) A model extends its generated schema class from `#database/schema`. The model carries relationships, hooks, scopes, computed getters and behaviour. It re-declares a generated column only to refine that one column: `serializeAs`, `prepare` or `consume`, or a narrower type.
- [ ] **MOD-3** (Rule) Change a generated type that applies across tables in `database/schema_rules.ts`.
- [ ] **MOD-4** (Rule) Add shared behaviour with a mixin applied through `compose`: `class User extends compose(UserSchema, withAuthFinder(hash))`.
- [ ] **MOD-5** (Law) Columns are `snake_case`; model properties are camelCase. A foreign key is the singular model name plus `_id`. Timestamps are `created_at` and `updated_at`.
- [ ] **MOD-6** (Rule) Hide a column from output by re-declaring it with `@column({ serializeAs: null })`.
- [ ] **MOD-7** (Rule) Declare a relationship with the related model as a function (`() => Post`), and declare both sides.
- [ ] **MOD-8** (Rule) A hook is a static method with its decorator. A filter that must cover every read is on both `beforeFind` and `beforeFetch`. Hooks do not run for bulk `update` and `delete`.
- [ ] **MOD-9** (Law) A query scope is a static property made with `scope()`.
- [ ] **MOD-10** (Law) A key the application generates needs `static selfAssignPrimaryKey = true`.
- [ ] **MOD-11** (Guideline) Avoid native database enums. Store a short string and narrow its type.
- [ ] **DB-1** (Guideline) Read and write through the model. Use the database query builder for what a model cannot express.
- [ ] **DB-2** (Guideline) Prefer the managed transaction, `db.transaction(async (trx) => { ... })`, which commits on return and rolls back on a throw.
- [ ] **DB-3** (Law) Inside a transaction every query carries the client: `Model.query({ client: trx })`, `Model.create(data, { client: trx })` or `model.useTransaction(trx)`.
- [ ] **DB-4** (Law) Bind values in `db.rawQuery`. Never build SQL from input.
- [ ] **DB-5** (Law) Network calls, mail and password hashing stay outside a transaction.
- [ ] **DB-6** (Rule) A migration extends `BaseSchema`, sets `protected tableName`, and has `up()` and `down()`. Its file is named by `node ace make:migration`.
- [ ] **DB-7** (Law) A released migration is never edited. A fix is a new migration.
- [ ] **DB-8** (Rule) Data changes go in `this.defer()`.
- [ ] **DB-9** (Law) A foreign key is declared with `.references().inTable()` and an explicit `.onDelete()`.
- [ ] **DB-10** (Law) Production does not roll back: `disableRollbacksInProduction: true` in `config/database.ts`. The framework offers it as an option.
- [ ] **DB-11** (Law) A seeder is a default-exported class that extends `BaseSeeder`. One that holds development or test data limits itself with `static environment`. A model factory lives in `database/factories`.

## Services, providers and the container

*When:* You touched a service or a provider.

Mechanical checks:

- [ ] `grep -rnE "^export (async )?function" app` prints only factories and pure functions (SVC-5)
- [ ] `grep -rnE "^\s*console\." app providers start` prints nothing (SVC-8)

Items:

- [ ] **SVC-1** (Rule) Business logic that more than one entry point needs lives in a class in `app/services/<name>_service.ts`, created with `node ace make:service`, which writes a named export.
- [ ] **SVC-2** (Law) The container builds a service: a controller or another service takes it through the constructor with `@inject()`, an Ace command through an `@inject()` `run` method, and code with no constructor to inject into through `app.container.make`. Nothing under `app/` calls `new` on a service.
- [ ] **SVC-3** (Rule) A service does not read the HTTP context unless it is injected with it. A context passed to it as an argument counts as injected.
- [ ] **SVC-4** (Rule) Replace a service in a test with the test context's `swap(Service, fake)`, which restores itself.
- [ ] **SVC-5** (Law) Under `app/`, behaviour that has state, does I/O or takes a dependency is a class method. An exported function is a factory that builds and returns an instance, or a pure function, which takes every input as an argument, awaits nothing and reads no module-level variable. A constant is not a variable (PKG-35).
- [ ] **SVC-6** (Rule) Write a provider only for container bindings, framework extensions (macros, `HttpContext` properties), or work that starts and stops with the application. One-off setup is a preload file.
- [ ] **SVC-7** (Law) In a provider: `register` only binds and is synchronous; `boot` configures. `register`, `boot` and `start` also run in console, test and tooling runs, and preload files are imported after `start`, so nothing there connects, listens or spawns. Long-running work starts in `ready` and stops in `shutdown`.
- [ ] **SVC-8** (Law) Application code logs through the logger, not `console`.

## Authentication and authorization

*When:* You touched sign-in, sessions or a permission check.

- [ ] **AUT-1** (Rule) Guards are defined in `config/auth.ts`. The session guard is named `web`; the access-token guard is `api`.
- [ ] **AUT-2** (Rule) The `User` model composes `withAuthFinder(hash)`. Credentials are checked with `User.verifyCredentials(email, password)`, which resists timing attacks.
- [ ] **AUT-3** (Rule) A route is protected by the named `auth` middleware: `.use(middleware.auth())` or `.use(middleware.auth({ guards: ['api'] }))`.
- [ ] **AUT-4** (Rule) An action reads the user with `auth.getUserOrFail()` behind the `auth` middleware, and `auth.user` where a user is optional.
- [ ] **AUT-5** (Rule) Authorization is Bouncer: an ability in `app/abilities/main.ts` for a simple check, a policy in `app/policies/<model>_policy.ts` for checks about one model.
- [ ] **AUT-6** (Rule) A policy has one method per action, even when two have the same body.
- [ ] **AUT-7** (Rule) An action authorizes with `bouncer.with(PostPolicy).authorize('edit', post)`, or `.denies()` when it answers itself.
- [ ] **AUT-8** (Law) Hash with the `hash` service; encrypt with the `encryption` service. No custom hashing. A `node:crypto` digest of a value that is not a password, such as a fingerprint or a lookup key, is not custom hashing: `@adonisjs/auth` stores a SHA-256 digest of each token.
- [ ] **AUT-9** (Law) Every route that is not public is authorized on the server: by middleware on the route or its group, or by a check in the action or the service it calls. A hidden button is not authorization.

## Security

*When:* You touched rate limits, CORS, Shield or secrets.

- [ ] **SEC-1** (Rule) A rate limit is a named throttle defined in `start/limiter.ts` with `limiter.define` and applied to routes with `.use(throttle)`.
- [ ] **SEC-2** (Rule) A 429 keeps the limiter's `X-RateLimit-*` and `Retry-After` headers.
- [ ] **SEC-3** (Law) `config/cors.ts` lists real origins. Never pair `credentials: true` with a wildcard origin.
- [ ] **SEC-4** (Rule) `config/shield.ts` carries CSRF, CSP, HSTS, frame and content-type settings. A server-rendered or session application keeps CSRF protection on.
- [ ] **SEC-5** (Law) `APP_KEY` is a secret and is never committed.
- [ ] **SEC-6** (Law) Bearers (reset tokens, invitation tokens, session ids) are never logged.

## Logging, mail, events and health checks

*When:* You log, send mail, emit an event or touch a health check.

- [ ] **OPS-1** (Rule) Inside a request, log with `ctx.logger`, so the line carries the request id. Use the logger service outside a request.
- [ ] **OPS-2** (Rule) Log an error under the `err` key. Hide sensitive values with the logger's `redact` option.
- [ ] **OPS-3** (Law) A mail is a class in `app/mails`.
- [ ] **OPS-4** (Law) An event is a class in `app/events` that extends `BaseEvent` and only carries data. It is dispatched with `events.UserRegistered.dispatch(user)`.
- [ ] **OPS-5** (Law) A listener is a class in `app/listeners` with a `handle` method. Listeners are attached in the `start/events.ts` preload file, through the `#generated/events` and `#generated/listeners` barrel files.
- [ ] **OPS-6** (Rule) Health checks are registered in `start/health.ts` as `healthChecks`. A `HealthChecksController` serves `/health/live` and `/health/ready`. A custom check extends `BaseCheck` and its class name ends in `Check`.
- [ ] **OPS-7** (Law) Listeners are referenced lazily through the barrel file; a static listener import in `start/events.ts` is a lint error (`@adonisjs/prefer-lazy-listener-import`).

## Ace commands

*When:* You touched an Ace command.

Mechanical checks:

- [ ] `grep -rnE "^\s*console\." commands` prints nothing (CMD-5)

Items:

- [ ] **CMD-1** (Law) A command is a default-exported class in `commands/` that extends `BaseCommand` and sets `static commandName` and `static description`. A base class that commands share is a default export in a file whose name starts with `_`, which Ace does not load, as Lucid's `commands/migration/_base.ts` is. A command that extends it extends `BaseCommand`.
- [ ] **CMD-2** (Law) A grouped command is named `namespace:action`. The name has one colon, as every command of the framework has.
- [ ] **CMD-3** (Law) A command that touches models or services sets `static options = { startApp: true }`.
- [ ] **CMD-4** (Law) Inputs are declared with `@args` and `@flags`, each with a description.
- [ ] **CMD-5** (Law) Output goes through `this.logger` and `this.ui`, not `console`.
- [ ] **CMD-6** (Rule) A command does not catch an error only to report it. The error reaches Ace, which sets `this.error` and `this.exitCode = 1`; `completed()` logs one safe line and returns `true` so Ace does not print the raw error.
- [ ] **CMD-7** (Guideline) A command calls the same service a controller would. It holds no business rule of its own.
- [ ] **CMD-8** (Law) A file in `commands/` that is not a command starts with `_`.

## Tests

*When:* You wrote or changed a test.

Mechanical checks:

- [ ] `grep -rnE "^(let|var) " tests` prints nothing (TST-12)
- [ ] `grep -rLE "\btest(\.group)?\(" tests --include='*.spec.ts'` prints nothing (TST-11)
- [ ] `grep -rn "withGlobalTransaction" tests` prints nothing: the name is deprecated (TST-4)

Items:

- [ ] **TST-1** (Rule) Tests run on Japa. Suites are declared in `adonisrc.ts`: `unit` and `functional`, plus `browser` when there are browser tests.
- [ ] **TST-2** (Rule) A test file is `<subject>.spec.ts`, in a folder that mirrors what it tests.
- [ ] **TST-3** (Law) `tests/bootstrap.ts` exports `plugins`, `runnerHooks` and `configureSuite`, and is the only place plugins are registered.
- [ ] **TST-4** (Rule) Related tests sit in a `test.group`. State is reset in a group hook: `group.each.setup(() => testUtils.db().wrapInGlobalTransaction())`, or `truncate()`.
- [ ] **TST-5** (Rule) An API test calls a route by its name: `client.visit('posts.store')`. The framework also allows a URL; we use the name. A request to a path that has no named route (an unmatched path, a static file, a CORS preflight) uses the URL.
- [ ] **TST-6** (Rule) An API test signs in with `.loginAs(user)`, with `.withGuard('api')` before it for a guard that is not the default. A test of the sign-in itself, or of a value the sign-in route creates and `loginAs` does not (a session row, a cookie), signs in through the route.
- [ ] **TST-7** (Rule) Rows are asserted with the `dbAssertions` plugin: `db.assertHas`, `db.assertMissing`, `db.assertCount`.
- [ ] **TST-8** (Rule) Test rows come from model factories.
- [ ] **TST-9** (Rule) Fake what leaves the process, with the forms that restore themselves: `using fake = mail.fake()` and the test context's `swap`. The database is real.
- [ ] **TST-10** (Rule) A command is tested with `ace.create(Command, args)`, `command.exec()` and `command.assertSucceeded()`.
- [ ] **TST-11** (Law) A test file contains tests only. Reusable code is in `tests/helpers/`.
- [ ] **TST-12** (Law) No `let` or `var` is shared across tests at file scope. A test creates what it needs, or a group hook does.
- [ ] **TST-13** (Law) Every `getByText('...')` call given a string passes `exact: true` or `exact: false`. Other locators are not covered.
- [ ] **TST-14** (Guideline) A test title is a lowercase sentence that says what happens. A group title is a noun phrase.
- [ ] **TST-15** (Rule) `.env.test` sets `SESSION_DRIVER=memory`, so `loginAs` and `withSession` work in API tests.

## The frontend API client

*When:* You call the API from the frontend.

- [ ] **API-1** (Law) The backend generates the registry with `generateRegistry()` in the `init` hook of `adonisrc.ts`, and exports `./registry` and `./data` from its `package.json`. This item is checked in the backend.
- [ ] **API-2** (Rule) The frontend creates one Tuyau client for each registry and calls a route by its name: `client.request('posts.index')`, or `api.<route>` with a query integration. The client also takes a typed URL pattern (`client.get('/posts')`); we use the name. No request is a `fetch` of a URL written by hand. A URL built from the route name (`client.getRoute(name).url`, `urlFor`) is for a link or a download. A request made by `fetch` of that URL fails: the client makes the request.
- [ ] **API-3** (Law) Request and response types come from the registry. Do not restate them.
- [ ] **API-4** (Rule) With TanStack Query, a read is `useQuery(api.<route>.queryOptions(...))` and a write is `useMutation(api.<route>.mutationOptions(...))`.

---

# 3. Packages


## Layout

*When:* You added, moved or renamed a file.

- [ ] **PKG-1** (Law) The implementation is in `src/`. At the repository root the only source files are `index.ts` and `configure.ts`; everything else there is configuration or one of the framework's folders (`providers/`, `services/`, `commands/`, `stubs/`, `factories/`, `modules/`, `bin/`, `tests/`).
- [ ] **PKG-2** (Rule) Create only the folders the package needs. A package with nothing to bind and nothing to register at boot has no `providers/`; one with no container service has no `services/`. A provider that only adds a macro or a boot hook is valid, as the VineJS provider of `@adonisjs/core` is.

## Name and manifest

*When:* You touched `package.json`.

Mechanical checks:

- [ ] `pnpm pack --dry-run` lists only `build/`, `README.md`, `LICENSE.md` and `package.json`
- [ ] no `@adonisjs/*` package is under `dependencies`

Items:

- [ ] **PKG-4** (Rule) The npm name is `@kevinjohn/adonisjs-<name>`; the repository is `oss-adonisjs-<name>`. The name says what the package does in the framework's vocabulary.
- [ ] **PKG-5** (Law) `"type": "module"`, `engines.node >= 24`, `"files": ["build", "!build/bin", "!build/tests"]`, and an `exports` map. `files` may list more, as long as tests and `bin` stay out.
- [ ] **PKG-6** (Law) `@adonisjs/core` and every other framework package the code imports (`@adonisjs/lucid`, `@adonisjs/session`, `@adonisjs/assembler`) is a `peerDependency`, and a `devDependency` for the package's own tests. Optional ones are marked in `peerDependenciesMeta`.
- [ ] **PKG-7** (Rule) A peer range names the major: `^7.0.0`. Do not pin a peer to an exact version.
- [ ] **PKG-8** (Law) The package builds with `tsdown` plus `tsc --emitDeclarationOnly --declaration`, and copies `stubs/**/*.stub` into `build` with `copyfiles --up=1`, as the official packages do.
- [ ] **PKG-9** (Rule) When the package is published to a registry, `publishConfig` sets `access: public` and `provenance: true`.

## The export map

*When:* You changed what the package exports.

Mechanical checks:

- [ ] every `exports` target exists after `build`

Items:

- [ ] **PKG-10** (Law) Nothing outside the export map is importable. A consumer never imports from `build/src/...`.
- [ ] **PKG-11** (Law) Public types live in `src/types.ts`, exported from `./types`; the file may re-export from other type files. Lists the application extends (`LimitersList`) are interfaces there, augmented from the application's config file. Types that need an optional peer dependency are exported from `./types/<name>` instead, as `@adonisjs/auth` exports `./types/session`. A feature subpath may re-export a type; the type is defined once. A type file holds types only, as the files under `src/types/` of `@adonisjs/http-server` do: a type defined in a file that has runtime code is not re-exported from `src/types.ts`.
- [ ] **PKG-12** (Law) The export map is public API. Removing or renaming a subpath is a breaking change.

## The configure hook and stubs

*When:* You touched `configure.ts` or a stub.

Mechanical checks:

- [ ] running the configure hook twice on a scratch application leaves no duplicate entry

Items:

- [ ] **PKG-13** (Law) A package that needs anything in the application (a config file, a provider, a middleware, an environment variable, a migration) ships a `configure` function, so `node ace add <package>` sets it up. The README does not ask for manual edits the hook could make.
- [ ] **PKG-14** (Law) The hook changes the application only through codemods: `makeUsingStub`, `updateRcFile` (`addProvider`, `addCommand`, `addPreloadFile`), `registerMiddleware`, `defineEnvVariables`, `defineEnvValidations`, `registerJapaPlugin`, `registerPolicies`. `@adonisjs/assembler` is an optional peer dependency because the codemods need it.
- [ ] **PKG-15** (Law) The hook is safe to run twice.
- [ ] **PKG-16** (Law) Choices come from a flag first, then a prompt: `command.parsedFlags.store`, else `command.prompt.choice(...)`. An invalid choice sets `command.exitCode = 1`, logs through `command.logger` and returns. An option with a default is a flag and needs no prompt.
- [ ] **PKG-17** (Law) Templates are `.stub` files under `stubs/`, in folders that mirror where they land: `stubs/config/<name>.stub`, `stubs/start/<name>.stub`, `stubs/make/migration/<name>.stub`. Each stub states its destination with `exports({ to: app.configPath('<name>.ts') })`. `app.configPath` is the helper for a config file; a stub that lands elsewhere uses that folder's helper (`app.startPath`, `app.migrationsPath`).
- [ ] **PKG-18** (Law) `stubs/main.ts` exports `stubsRoot = import.meta.dirname`.
- [ ] **PKG-19** (Law) A stub writes code the application owns afterwards, in this book's application style: `env` read in the config file, `defineConfig`, the `declare module` block. The `declare module` block is written only when the package has a list the application extends.

## Configuration

*When:* You changed how the package is configured.

Mechanical checks:

- [ ] `grep -rnE "process\.env|services/env" src providers services commands 2>/dev/null` prints nothing (PKG-23)

Items:

- [ ] **PKG-20** (Law) When the package has settings, the application configures the package in `config/<name>.ts`, with the package's `defineConfig`. A helper for one feature may be used inside it, as `@adonisjs/auth` uses `sessionGuard`. A package with no settings has no `defineConfig`.
- [ ] **PKG-21** (Law) `defineConfig` validates its input and throws `InvalidArgumentsException` or `RuntimeException` from `@adonisjs/core/exceptions`, with a message that names the package's config and the key.
- [ ] **PKG-22** (Law) When configuration needs the booted application or a lazily imported driver, `defineConfig` returns a config provider (`configProvider.create`), and the service provider resolves it with `configProvider.resolve`.
- [ ] **PKG-23** (Rule) The code a package ships (`src/`, `providers/`, `services/`, `commands/`) never reads `process.env` or the `env` service. The application's config file does. The repository's own `bin/` scripts are not shipped and may read `process.env`.
- [ ] **PKG-24** (Law) Environment variables a package introduces are UPPER_SNAKE with the package's name first: `LIMITER_STORE`, `SESSION_DRIVER`. A variable the framework owns (`NODE_ENV`, `APP_KEY`) is not one the package introduces.

## Provider and container service

*When:* You touched the provider or `services/main.ts`.

- [ ] **PKG-25** (Law) The provider is `providers/<name>_provider.ts`, default-exporting `<Name>Provider` with `constructor(protected app: ApplicationService) {}`.
- [ ] **PKG-26** (Law) `register` binds a singleton: under a dotted name (`'<name>.manager'`) when the application imports it as a container service, otherwise by class. A named binding is added to `ContainerBindings` with `declare module '@adonisjs/core/types'` in the same file.
- [ ] **PKG-27** (Law) The binding is lazy: configuration is read and the object built inside the singleton callback, not in `register` itself.
- [ ] **PKG-28** (Law) Events the package emits are typed in `EventsList` in the same block and named `<namespace>:<event>` (`session:initiated`, `limit:exceeded`).
- [ ] **PKG-29** (Law) A named binding has a `services/main.ts` that resolves it after boot and default-exports it, so the application writes `import limiter from '@adonisjs/limiter/services/main'`. A binding the application does not import is bound by class (PKG-26) and has none.
- [ ] **PKG-30** (Law) A property a middleware sets on `HttpContext` is typed in that middleware's file (MID-6), as `@adonisjs/session` does. Macros, getters and Edge plugins the provider registers have their type augmentation in the provider file. A Japa plugin is exported from `./plugins/<tool>` for the application to register in `tests/bootstrap.ts`.

## Errors, logging and style

*When:* You throw an error, log, or ship a middleware or command.

Mechanical checks:

- [ ] `grep -rnE "extends Error\b|throw new Error\(|^\s*console\." src providers services commands 2>/dev/null` prints nothing (PKG-31, PKG-34)

Items:

- [ ] **PKG-31** (Law) Every exception the package throws is defined in `src/errors.ts`, one class per cause: `<Cause>Exception extends Exception`, with a unique raw `static code = 'E_<CODE>'` for each distinct cause and `static status`. A cause is the rule or contract that failed; a different field, value, message or route alone is not a different cause. A subclass that answers with its parent's response keeps its parent's code and is still exported under its own `E_<CODE>` name. The file exports each class under its code, `export const E_<CODE> = <Cause>Exception`, and `index.ts` exports the file as the `errors` namespace: `import { errors } from '<package>'`. An exception from the framework or another package that passes through unchanged is not thrown by the package.
- [ ] **PKG-32** (Law) The code is stable. The package throws by it, `throw new E_<CODE>()`, and an application recognises it with `instanceof errors.E_<CODE>` or by `code`, never by message. A wire code covers several raw codes only to prevent enumeration or conceal configuration details, with a one-line comment naming what it protects; compatibility alone is not a reason. One comment may cover adjacent mappings that protect the same thing.
- [ ] **PKG-46** (Law) No exported exception constructor, including an inherited one, takes a status or a code. Enforce this through its signature, without runtime mutation guards. Applications choose different response statuses in their own handlers. It takes only what the message or the response needs (an id, a name, a detail sentence, `{ cause }`); a sentence that never varies is `static message`. A package does not use `createError`.
- [ ] **PKG-47** (Law) A package never throws a bare `Error`. Wrong configuration or wrong use by the application's developer throws `InvalidArgumentsException` or `RuntimeException` from `@adonisjs/core/exceptions`; everything else is a class in `src/errors.ts`.
- [ ] **PKG-49** (Law) Native `AggregateError` is allowed in two cases only: the work fails and its cleanup fails too, or the work succeeds and more than one cleanup step fails. `errors[0]` is the work's failure, or the first cleanup failure when the work succeeded; later failures follow in the order observed. An `AggregateError` received from another layer is passed on unchanged, unless this layer's cleanup also fails: it is then `errors[0]` of a new one. Every function that throws one or passes one on documents it in `@throws`. It is never used for an expected 4xx outcome or a case a caller branches on; that is a package exception class. `@throws` covers what the function throws or knowingly passes on, not a failure inside a callback the application supplies. A delivery that fails after the work is committed is not cleanup.
- [ ] **PKG-33** (Law) An exception whose response needs more than its status, code and message (a header, a redirect, a different body) implements `handle` on itself, so the application's handler needs no special case. Every other exception is left for the framework to render.
- [ ] **PKG-34** (Law) Diagnostics use `debuglog('<scope>:<name>')` from `node:util` in `src/debug.ts`. A package does not write to `console`. It logs through the application's logger only when the application's configuration passes that logger in. Inside a request, `ctx.logger` is the application's logger and may be used.
- [ ] **PKG-35** (Law) State is a class. A function the export map exposes is one of: `defineConfig`; `configure`; a factory that returns an instance or a config provider; a decorator; a mixin; a plugin for Edge, Japa or the assembler; or a pure function, which takes every input as an argument, awaits nothing and reads no module-level variable (a constant is not a variable). A function inside the package that keeps no state is not checked, as `@adonisjs/core` keeps its own in `src/utils.ts`. A generated file, such as the commands index, is not checked. An instance is an instance of a class. A factory that returns one function, as `@adonisjs/shield` exports `csrfFactory` from `./guards`, passes. A function that returns an object of functions passes only when it and each function it returns are pure.
- [ ] **PKG-36** (Law) A middleware the package ships is a class with `handle(ctx, next, options?)`, exported from its own subpath. The configure hook registers it, unless the middleware reads `ctx.auth`: the README then tells the application where to mount it.
- [ ] **PKG-37** (Law) A command the package ships is a file in `commands/`. The build writes `build/commands/main.js` with `adonis-kit index build/commands`, exported as `./commands` and registered with `rcFile.addCommand('<package>/commands')`.
- [ ] **PKG-38** (Law) A package does not import from an application and makes no assumption about its folder names beyond the framework's. Code a stub generates is application code and follows the application items.
- [ ] **PKG-48** (Rule) Everything an application calls from the export map has an `@example` in its TSDoc: each exported function, class, decorator and mixin, and each public method on an exported class or service. The example is the application's code, fenced as `ts`. A top-level export's example starts with its import from the public subpath; a method's starts from the instance. One example is enough; a second is for a second way to call it. Types, exception classes and what the framework calls instead of the application (the configure hook, the provider, commands, a middleware's `handle`, a controller's actions) need none. When the application reaches a method only through an interface, the example is on the interface member.

## Tests and release

*When:* You touched the provider, the configure hook, the export map or a test, or are releasing.

- [ ] **PKG-39** (Law) Tests run on Japa through `bin/test.ts`, in `tests/**/*.spec.ts`. Shared test code is in `tests/helpers.ts`, or in files under `tests/helpers/`. Shared means used by more than one spec file. Tests of repository tooling that is not shipped are not covered. A type assertion is a test: it is inside a `test()` in a spec file, with `@japa/expect-type`, as `@adonisjs/core` has them in `tests/hash.spec.ts`.
- [ ] **PKG-40** (Law) The configure hook has a test (`tests/configure.spec.ts`) that runs it against a scratch application with `@japa/file-system` and asserts the files it wrote.
- [ ] **PKG-41** (Law) The provider has a test that boots an application with it and resolves the binding.
- [ ] **PKG-42** (Guideline) Public types are tested with `@japa/expect-type` where inference matters.
- [ ] **PKG-43** (Law) Coverage is collected with `c8`, as the package starter kit sets up.
- [ ] **PKG-44** (Rule) Versions follow semver. Each release has a changelog entry and a git tag `v<version>`.
- [ ] **PKG-45** (Rule) The README has, in this order: what it does, `node ace add <package>`, what the configure hook changed, configuration, usage, errors, and the supported AdonisJS versions. The install command is the one that works for how the package is distributed.

---

# Summary block for the pull request

```
AdonisJS checklist (draft <number>)
Sections run:
Mechanical checks: all as stated / exceptions:
Laws failed: none
Items n/a (id: reason):
Guideline notes answered (id: fix or reason):
Departures cited (id: departure number):
```
