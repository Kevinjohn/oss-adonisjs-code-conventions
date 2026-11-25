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
| The AdonisJS way | [adonisjs/checklist.md](./adonisjs/checklist.md) | Every AdonisJS item as a check, with its tier. Draft 4. |
| | [adonisjs/cookbook.md](./adonisjs/cookbook.md) | The reason, origin and recipe for each item. |
| | [adonisjs/terminology.md](./adonisjs/terminology.md) | One word per concept, and the format for a repository's own words. |

## What a repository keeps for itself

- Its **departures list**: numbered, with entries marked **Aligning** for code that does not meet
  an item yet.
- Its **product words** and rejected synonyms, in the format at the end of the terminology page.
- Its commands, checks and product rules.

## Status

- The AdonisJS checklist has item ids and tiers. The pages under `house/` do not yet: they are
  prose, moved here unchanged from where they were written.
