# Terminology

One word per concept, and one concept per word, in code, comments, tests, commit messages,
documentation and the UI.

This page holds what every repository shares: the rules and the words the frameworks own. Each
repository keeps its own product words, in the format at the end of this page, and its own list of
rejected synonyms for its terminology check to read.

## Rules

1. **A framework word means only the framework thing.** AdonisJS, Lucid, VineJS, Japa, Bouncer, Ace,
   Account Kit, React, Zustand, Radix/shadcn, cmdk, TanStack Query, Playwright and Vitest own the words in
   [Framework reserved words](#framework-reserved-words). Product code does not reuse them for anything else.
2. **One concept, one word.** The entries below list the rejected synonyms. A rejected synonym is a defect
   when it is found, not a style preference.
3. **Code word and UI word match**, unless the entry records a deliberate pair (for example `masquerade` in
   code and "view as member" on screen).
4. **Package, header and package-config names keep their own spelling**:
   `@kevinjohn/adonisjs-origin-guard`, `Idempotency-Key`, `Content-Security-Policy`, `login_link_tokens` (an
   Account Kit table), `passwordPolicy` (an Account Kit config key), `requestKey` and `Operation` (the
   duplicate-request guard), `web_effective` (the Masquerade package's guard), `E_*` codes.
5. **Spelling.** Prose, UI copy and product-concept identifiers use British spelling (`utilisation`,
   `anonymise`, `colour` in copy, `catalogue`, `favourite`). Generic programming identifiers that mirror a
   platform or library keep American spelling (`color`, `normalize`, `serialize`, `initialize`,
   `authorization`). Write "AdonisJS", never "Adonis".

## Framework reserved words

Shared by every repository. A repository that does not use a library ignores its rows.

| Word                | Owner                  | Means only                                                                                                                                                                     | Not for                                                                                                                                                              |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| guard               | AdonisJS auth          | An authentication guard in `config/auth.ts` (`web`, `web_effective`, the kit's managed guard)                                                                                  | route middleware sets (say **route middleware**); TypeScript `is*` functions are "type guards" and keep that full name                                               |
| policy, ability     | Bouncer                | Bouncer's class and function. CapacityLens has none (departure 11)                                                                                                             | rule sets (say **rules**), an access grant, CORS origins, repeat settings                                                                                            |
| exception           | AdonisJS               | A thrown class the exception handler turns into a response, in `app/exceptions/<name>_exception.ts`                                                                            | a special case in prose is fine. No backend class the handler renders is named `*Error`. Shared and frontend `Error` subclasses are not exceptions and keep `*Error` |
| exception handler   | AdonisJS               | `app/exceptions/handler.ts`                                                                                                                                                    |                                                                                                                                                                      |
| controller          | AdonisJS               | An HTTP controller in `app/controllers`                                                                                                                                        | frontend state classes and hooks (say **view model**)                                                                                                                |
| model               | Lucid                  | A Lucid model in `app/models`                                                                                                                                                  | frontend screen state (say **view model**, in full)                                                                                                                  |
| action              | AdonisJS / Zustand     | A controller method; a Zustand store method                                                                                                                                    | a permission (say **permission**); a UI button is a "button" or "menu item". The audit `action` column is the audit verb                                             |
| command             | Ace / cmdk             | An Ace command in `commands/`; the cmdk `Command` primitive behind the command palette                                                                                         | an idempotent HTTP write (say **operation**)                                                                                                                         |
| operator command    | Ace                    | An Ace command meant for whoever runs the server                                                                                                                               |                                                                                                                                                                      |
| service             | AdonisJS               | **Container service**: a framework singleton such as `@adonisjs/core/services/router`. **Product service**: a `*Service` class in `app/services` that the container constructs | hosting prose ("systemd service") is fine                                                                                                                            |
| middleware          | AdonisJS               | A class in `app/middleware/*_middleware.ts`                                                                                                                                    |                                                                                                                                                                      |
| validator           | VineJS                 | A compiled schema exported from `app/validators`                                                                                                                               |                                                                                                                                                                      |
| validation rule     | VineJS                 | A rule made with `vine.createRule` (`validators/request_rules.ts`); keeps the full name                                                                                        | product **rules**                                                                                                                                                    |
| transformer         | AdonisJS               | A class in `app/transformers`                                                                                                                                                  |                                                                                                                                                                      |
| migration, seeder   | Lucid                  | A schema change; a script in `database/seeders` that inserts rows                                                                                                              |                                                                                                                                                                      |
| factory             | Lucid                  | A model factory. None exist; the word is reserved                                                                                                                              |                                                                                                                                                                      |
| scope               | Lucid / Access Control | A Lucid query scope; the Access Control package's `scope_id` for a company (`memberships.scope_id`, `request_receipts.scope_id`)                                               | product code says `company`                                                                                                                                          |
| session             | AdonisJS / Account Kit | A signed-in session                                                                                                                                                            |                                                                                                                                                                      |
| account             | Account Kit            | A person's sign-in identity, and the **Account** page that shows it                                                                                                            | the tenant (say **company**)                                                                                                                                         |
| user                | AdonisJS / Account Kit | The `User` model: one sign-in identity (`userId`)                                                                                                                              |                                                                                                                                                                      |
| registration        | Account Kit            | The kit's API name (`accountKit.registration`)                                                                                                                                 | product words say **sign up**                                                                                                                                        |
| admission           | Account Kit            | The kit's approval step before a signed-up person joins a company                                                                                                              | UI says "ask for access", "waiting for approval", "approve" and "decline"                                                                                            |
| suite, group        | Japa                   | A test suite in `adonisrc.ts`; a `test.group`                                                                                                                                  |                                                                                                                                                                      |
| fixture             | Playwright             | A Playwright fixture; also static test-only data                                                                                                                               | production code                                                                                                                                                      |
| store, slice        | Zustand                | The store in `store/useStore.ts`; a file in `store/slices`                                                                                                                     | a subset of company data (say **set** or name it)                                                                                                                    |
| context, provider   | React                  | React Context and its provider component                                                                                                                                       | a request token or a parameter bag                                                                                                                                   |
| boundary            | React                  | An error boundary (`componentDidCatch`)                                                                                                                                        | a conditional-render wrapper (say **gate** or name it)                                                                                                               |
| dialog, sheet, card | Radix/shadcn           | The primitives and components built directly on them                                                                                                                           |                                                                                                                                                                      |
| QueryClient         | TanStack Query         | The query client                                                                                                                                                               | an HTTP reader (say **api**)                                                                                                                                         |

## Product words

Each repository defines its own, in a file at its root, in these two tables. A rejected synonym is
listed once, against the word that replaces it.

### Architecture words

| Word | Means | Instead of |
| ---- | ----- | ---------- |

### Domain words

| Concept | Code | UI and docs | Rejected |
| ------- | ---- | ----------- | -------- |
