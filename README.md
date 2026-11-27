# Code conventions

The source of truth for how our AdonisJS applications and packages are written and reviewed. It
belongs to no product. A repository adopts it by linking here from its
`AGENTS.md` and keeping only what is its own.

## What is here

| Part | Page | What it holds |
| --- | --- | --- |
| How to use it | [workflow.md](./workflow.md) | The one question a review asks, the three tiers (law, rule, guideline), when an item does not apply, departures, and the two-pass review. |
| Our way of working | [house/principles.md](./house/principles.md) | Design principles. |
| | [house/single-responsibility.md](./house/single-responsibility.md) | One responsibility per file, and when to split. |
| | [house/code-quality.md](./house/code-quality.md) | The defects to look for in any change. |
| | [house/code-standards.md](./house/code-standards.md) | Names, errors, comments and TSDoc. |
| The AdonisJS way | [adonisjs/checklist.md](./adonisjs/checklist.md) | Every AdonisJS item as a check, with its tier. Draft 15. |
| | [adonisjs/cookbook.md](./adonisjs/cookbook.md) | The reason, origin and recipe for each item. |
| | [adonisjs/terminology.md](./adonisjs/terminology.md) | One word per concept, and the format for a repository's own words. |

## The review skill

[skills/adonisjs-conventions-review](./skills/adonisjs-conventions-review/SKILL.md) reviews a
repository, or a folder in one, against the AdonisJS checklist and writes the findings as
`findings.json` and `report.md`. It is read-only: it reports, and does not fix. It can review only
the lines a branch changed. It leaves out the items that lint or the conventions check decides. Example code, build output, Markdown and HTML are left out unless the request
names them.

Install it by linking the folder into the skills folder your agent reads, from a checkout of this
repository. The skill reads the checklist from that checkout, so `git pull` updates both.

```bash
ln -s "$(pwd)/skills/adonisjs-conventions-review" ~/.agents/skills/adonisjs-conventions-review
```

Then ask for it: "review `app/controllers` against the AdonisJS conventions, code only, sections
applications/controllers and applications/validators".

## The conventions check

`scripts/check-conventions.mjs` checks the items that have one right answer: a file name, a
folder, an export form, a key in `package.json`. The same tree gives the same findings on every
run, so the count only falls as the code is fixed.

```bash
node /path/to/this/repository/scripts/check-conventions.mjs
```

Run it from the root of the repository to check. It finds each application and package in it.
It reads the statements of a file: source that a package holds as text, in a string or a
template, is not checked. A package's `docs/` and `examples/` folders are not checked as the
package; an application under `examples/` with its own `package.json` is checked as an
application.

[adonisjs/checks.json](./adonisjs/checks.json) says how every item is checked:

| Value | Who decides the item |
| --- | --- |
| `lint` | The official ESLint preset. A passing `lint` script is the answer. |
| `script` | `check-conventions`, or `check-terminology` for VOC-2. |
| `both` | `check-conventions` for what the files decide, and a reviewer for the rest. |
| `planned` | A reviewer, until a script check is written for it. |
| `model` | A reviewer. The item needs the code to be read. |
| `guideline` | A reviewer, as a note. It never blocks. |

A finding stays open until the code changes or the repository's departures list covers it. A
`conventions.config.json` at the root of the checked repository links a finding to a numbered
entry of that list:

```json
{
  "departures": {
    "file": "DECISIONS.md",
    "heading": "Framework departures",
    "entries": [{ "entry": 28, "item": "TOOL-2" }, { "entry": 25, "item": "CTL-4", "path": "app/controllers/" }]
  }
}
```

- The entry must exist in the file, once, under `heading` when one is given. For a law it must be
  marked **Aligning** and name an issue.
- When two links fit a finding, the one with the longer `path` covers it.
- A link that covers no finding is an error, so an entry does not outlive the code it covered.

## The terminology check

`scripts/check-terminology.mjs` fails on a rejected synonym in a file name or in the text of a
tracked file. It reads the shared table in [adonisjs/terminology.md](./adonisjs/terminology.md)
and, when the checked repository has one, the same table in that repository's own dictionary.

```bash
node /path/to/this/repository/scripts/check-terminology.mjs
```

Run it from the root of the repository to check. `npm test` here runs the tests of both checks
and of the review skill's script.

## What a repository keeps for itself

- Its **departures list**: numbered, with entries marked **Aligning** for code that does not meet
  an item yet.
- Its **product words** and rejected synonyms, in the format at the end of the terminology page.
- Its commands, checks and product rules.

## Status

- The AdonisJS checklist has item ids and tiers. The pages under `house/` do not yet: they are
  prose, moved here unchanged from where they were written.
