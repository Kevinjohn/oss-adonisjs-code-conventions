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

## The review skill

[skills/adonisjs-conventions-review](./skills/adonisjs-conventions-review/SKILL.md) reviews a
repository, or a folder in one, against the AdonisJS checklist and writes the findings as
`findings.json` and `report.md`. It is read-only: it reports, and does not fix.

Install it by linking the folder into the skills folder your agent reads, from a checkout of this
repository. The skill reads the checklist from that checkout, so `git pull` updates both.

```bash
ln -s "$(pwd)/skills/adonisjs-conventions-review" ~/.agents/skills/adonisjs-conventions-review
```

Then ask for it: "review `app/controllers` against the AdonisJS conventions, code only, sections
applications/controllers and applications/validators".

## What a repository keeps for itself

- Its **departures list**: numbered, with entries marked **Aligning** for code that does not meet
  an item yet.
- Its **product words** and rejected synonyms, in the format at the end of the terminology page.
- Its commands, checks and product rules.

## Status

- The AdonisJS checklist has item ids and tiers. The pages under `house/` do not yet: they are
  prose, moved here unchanged from where they were written.
