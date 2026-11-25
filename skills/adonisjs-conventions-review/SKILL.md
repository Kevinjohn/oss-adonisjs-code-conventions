---
name: adonisjs-conventions-review
description: Review an AdonisJS application or package against the AdonisJS conventions checklist and write a structured list of findings (findings.json and report.md). Takes a repository or a folder, or the lines a branch changed; a scope (code, tests or both); the checklist sections to run (or all); and an optional reviewer model. Example code and build output are left out unless asked for. Read-only, it reports and never fixes. Use when asked to check, audit or review code or a diff against the AdonisJS conventions or the checklist.
---

# AdonisJS conventions review

The review answers one question for each item: does this code match the item? It does not ask
whether the code is good, and it does not propose a fix. The output is evidence a later change is
built on.

The checklist and its procedure are in the repository this skill belongs to. Find it with
`realpath` on this skill's folder: the repository root is two folders up. From there:

- `adonisjs/checklist.md`: the items. Never work from a copy or from memory.
- `workflow.md`: the tiers, when n/a is valid, how to read an item, departures. Read it before the
  first review.
- `skills/adonisjs-conventions-review/scripts/report.mjs`: called `report` below. Run it with `node`.

The script lists the files, runs the mechanical checks and writes every output file. A reviewer
reads code and writes one record. Nothing else is written by hand.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| target | A repository, or a folder in one. | The current directory. |
| diff | A base branch or commit. The review covers only the lines changed since it. | None: every tracked file. |
| scope | `code`, `tests`, `both`. | `both` |
| sections | Section slugs from `report list`, a part (`every-change`, `applications`, `packages`), or `all`. | `all` |
| include | Folders to review that are left out by default. | None. |
| model | The model the reviewers and verifiers run on. | Sonnet in Claude, Terra in Codex. |
| departures | Path to the target's departures list. | Found by its heading; see step 2. |
| previous | A `findings.json` from an earlier run, to list what is resolved since. | None. |

Take the inputs from the request. Do not ask for one that has a default. "Review this branch" or
"before the pull request" means `diff` against the branch's base.

Left out by default: example code (a folder named `example` or `examples`, a `*.example.ts`
file) and output (`build`, `dist`, `coverage`, `tmp`, `.adonisjs`, `node_modules`). Review one
only when the request names it, by adding its folder to `include`.

## Rules

- Read-only on the target. Write only inside the run folder. Open no issue, post no comment,
  change no code and no departures list.
- A finding is an item id, a `path:line`, the quoted sentence of the item and the quoted code.
  No opinion, no cause, no fix.
- Review only the files in `files.json`. With a diff, a finding is on a line the diff changed.
- Something no item covers is not a finding. Leave it out.
- A guideline gets at most one finding per item.
- A finding a numbered departure or an Aligning entry covers is still recorded, with that
  entry's number.
- Do not guess. When the item's wording does not decide a case, first run `report item <id>`: it
  prints the item, its cookbook entry and the items they cite, and one of those often decides
  it. When none does, it is not a finding: record it under `unclear` as one question, with the
  ids read in `read`. Propose no answer and no looser reading. That list is how the checklist
  gets better.

## Steps

### 1. Fix the root and the kind

- An application root is a folder with `adonisrc.ts`. A package root is a folder with
  `configure.ts` beside `package.json` and no `adonisrc.ts`.
- The root is the target, or the nearest folder above it that is one of these. When the target
  holds several roots, do one complete run for each.
- The kind is `application` or `package`. `report list <kind>` prints the sections that apply.
- Paths in every record are relative to the root.

### 2. Find the departures list

Use the given path. Otherwise search the target repository's Markdown files for a heading that
contains "departures". Record the path, relative to the target's repository root, or `null` when
there is none. With `null`, no finding carries a departure number.

### 3. Create the run folder and prepare it

`<repository root of the target>/.conventions-review/<UTC time as YYYYMMDDTHHMMSSZ>/`. Write
`.conventions-review/.gitignore` containing `*` so the folder is never committed. Then write
`run.json`:

```json
{
  "root": "/absolute/path/to/the/root",
  "commit": "<git rev-parse --short HEAD of the target>",
  "folder": "app/controllers",
  "diff": null,
  "include": [],
  "kind": "application",
  "scope": "both",
  "sections": ["every-change/names", "applications/controllers"],
  "model": "<the reviewer model>",
  "departures": "DECISIONS.md"
}
```

`folder` is the target relative to the root, `.` for the whole root. `diff` is the base, or
`null`. `sections` is the slugs chosen, in checklist order; `all` is every slug
`report list <kind>` prints.

Run `report prepare <run folder>`. It writes:

- `files.json`: the files in this review, and with a diff the changed line ranges of each.
- `checks/<section>.json`: each mechanical check of each section, already run, with the lines it
  printed and the items it supports.

When `files.json` lists no file, stop and say so.

### 4. First pass: one reviewer per section

Give each section to one reviewer on the reviewer model. Run the reviewers at the same time when
the environment can start sub-agents; otherwise do the sections in turn. With one or two sections,
do them yourself.

A reviewer is given, and needs nothing else:

- The section text from `report section <slug>`, verbatim.
- The tier table, the n/a rule and the section "How to read an item" from `workflow.md`, verbatim.
- The root, the paths of `files.json` and of its section's file under `checks/`, and the path of
  the departures list.
- The "Rules" above and the record format below.
- A name of its own, for `reviewer`.

A reviewer does this:

1. Picks from `files.json` the files the section is about. Read the section's *When* line as
   "the review holds": "You touched a controller" means the controller files in `files.json`,
   and "Every change" means every file in it. When no file matches, every item is n/a with the
   reason "no file in scope".
2. Reads its checks file. Each printed line is a place to read; the item decides. It runs no
   check itself and records none.
3. Reads every picked file in full, and gives each item one result: `pass`, `fail`, `n/a` or
   `departure`. An item with several sentences passes only when every sentence holds. An item
   that passes although a check that names it printed lines needs a `reason`. A guideline about
   how a file was made, which the files do not show, is n/a with the reason "not decidable from
   the files".
4. Writes one finding for each place an item fails, quoting the code exactly as the file has it.
   Where an item fails because something is absent, `code` is empty and `observed` says what is
   absent and where it was looked for.
5. Reads the departures list. A finding an entry covers gets that entry's number, as an
   integer, in `departure`. Such a finding is not verified in the second pass.
6. Writes `sections/<slug with "/" replaced by "--">.json`:

```json
{
  "reviewer": "controllers-reviewer",
  "files_read": ["app/controllers/projects_controller.ts"],
  "items": [
    { "item": "CTL-4", "result": "fail" },
    { "item": "CTL-5", "result": "pass" },
    { "item": "CTL-6", "result": "pass", "reason": "each try block recovers and answers normally" },
    { "item": "CTL-10", "result": "n/a", "reason": "not decidable from the files" }
  ],
  "findings": [
    {
      "item": "CTL-4",
      "path": "app/controllers/projects_controller.ts",
      "line": 42,
      "sentence": "An action destructures what it uses from the HTTP context",
      "code": "async store(ctx: HttpContext) {",
      "observed": "",
      "departure": null
    }
  ],
  "unclear": [
    {
      "item": "CTL-7",
      "path": "app/controllers/exports_controller.ts",
      "question": "Does a status set through a variable count as a status set by number?",
      "read": []
    }
  ]
}
```

- `items` has every item of the section, once. `n/a` needs a `reason`.
- `read` of an unclear case lists the item ids `report item` printed as cited, `[]` when it
  printed none.
- `sentence` is copied from the item. `code` is copied from the file; check it is there before
  writing it. `observed` is one factual line, used only when the two quotes do not show the
  failure on their own. Leave it empty otherwise.

### 5. Check the records

Run `report build <run folder>`. It rejects, among others: an item with no result, a fail with
no finding, a sentence that is not in the item, a code quote that is not in the file, a file
that is not in `files.json`, a line the diff did not change, a second finding on a
guideline, and an unclear case that proposes an answer or has not read the items cited. Send each rejected record back to its reviewer once. A record that is still rejected
is corrected by you from the file.

### 6. Second pass: verify

`build` wrote `verify.json`: every finding still to verify, with the item's full text, the
quoted sentence, the path, the line and the code. It leaves out what the reviewer observed.

Give `verify.json` to a verifier on the reviewer model that wrote none of those findings. For
each entry the verifier:

1. Opens the file and reads the whole function or block around the line.
2. Writes down, in one line, what that code does. This comes before any judgement.
3. Answers one question: does that code fail the quoted sentence, as the item is written? A
   finding that needs a reading the item's words do not state is false.
4. In the entry's `section_file`, adds to the matching finding `"verified": true` or `false`,
   `"verify_note"` with the line from step 2, and `"verifier"` with its own name, which is not
   the reviewer's.

The verifier adds no finding. There is no third pass.

### 7. Build and report

Run `report build <run folder>`, with `--previous <findings.json>` when one was given. It writes:

- `findings.json`: every finding with a stable `key`, its tier and the cookbook item that shows
  the pattern to follow; the findings the second pass rejected; the findings resolved since the
  previous run; and the result of every item and every check.
- `report.md`: the same as tables. Findings by tier, then the coverage of every item.
- `unclear.md`, when a reviewer recorded an unclear case: the body of an issue for the
  conventions repository, grouped by item.

Answer with the path of `report.md`, the count of law, rule and guideline findings, the count
not verified, and the count of files left out. Say which sections had no file in scope. When
`unclear.md` exists, give its path and say it is ready to file. Do nothing further unless asked.

## What comes after

Not part of this skill; each needs its own request.

- `unclear.md` filed as an issue in the conventions repository, and each question settled there
  as `workflow.md` says under "Settling an unclear case", before any code changes.
- One issue per failed item, holding the item text, the cookbook item and every location from
  `findings.json`.
- The fix, by a stronger model than the reviewers.
- The done-test: this skill again, for the item's section and folder, with `previous` set to the
  earlier `findings.json`. The item no longer appears and the earlier findings are listed as
  resolved.
