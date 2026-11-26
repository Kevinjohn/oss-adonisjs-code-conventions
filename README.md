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
| The AdonisJS way | [adonisjs/checklist.md](./adonisjs/checklist.md) | Every AdonisJS item as a check, with its tier. Draft 12. |
| | [adonisjs/cookbook.md](./adonisjs/cookbook.md) | The reason, origin and recipe for each item. |
| | [adonisjs/terminology.md](./adonisjs/terminology.md) | One word per concept, and the format for a repository's own words. |

## The review skill

[skills/adonisjs-conventions-review](./skills/adonisjs-conventions-review/SKILL.md) reviews a
repository, or a folder in one, against the AdonisJS checklist and writes the findings as
`findings.json` and `report.md`. It is read-only: it reports, and does not fix. It can review only
the lines a branch changed. Example code, build output, Markdown and HTML are left out unless the request
names them.

Install it by linking the folder into the skills folder your agent reads, from a checkout of this
repository. The skill reads the checklist from that checkout, so `git pull` updates both.

```bash
ln -s "$(pwd)/skills/adonisjs-conventions-review" ~/.agents/skills/adonisjs-conventions-review
```

Then ask for it: "review `app/controllers` against the AdonisJS conventions, code only, sections
applications/controllers and applications/validators".

## The terminology check

`scripts/check-terminology.mjs` fails on a rejected synonym in a file name or in the text of a
tracked file. It reads the shared table in [adonisjs/terminology.md](./adonisjs/terminology.md)
and, when the checked repository has one, the same table in that repository's own dictionary.

```bash
node /path/to/this/repository/scripts/check-terminology.mjs
```

Run it from the root of the repository to check. `npm test` here runs the tests of the check and
of the review skill's script.

## What a repository keeps for itself

- Its **departures list**: numbered, with entries marked **Aligning** for code that does not meet
  an item yet.
- Its **product words** and rejected synonyms, in the format at the end of the terminology page.
- Its commands, checks and product rules.

## Status

- The AdonisJS checklist has item ids and tiers. The pages under `house/` do not yet: they are
  prose, moved here unchanged from where they were written.
