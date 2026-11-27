---
name: adonisjs-conventions-review
description: Review an AdonisJS application or package, or the frontend beside one, against the AdonisJS conventions checklist and write a structured list of findings (findings.json and report.md). Takes a repository or a folder, or the lines a branch changed; a scope (code, tests or both); the checklist sections to run (or all); and an optional reviewer model. Example code, build output, Markdown and HTML are left out unless asked for. Read-only, it reports and never fixes. Use when asked to check, audit or review code or a diff against the AdonisJS conventions or the checklist.
---

# AdonisJS conventions review

The review answers one question for each item: does this code match the item? It does not ask
whether the code is good, and it does not propose a fix. The output is evidence a later change is
built on.

The checklist and its procedure are in the repository this skill belongs to. The skill is
installed as a symbolic link into a checkout of that repository, so find it with `realpath` on
this skill's folder: the repository root is two folders up. A copy of the folder with no
checkout above it cannot run; say so and stop. From there:

- `adonisjs/checklist.md`: the items. Never work from a copy or from memory.
- `adonisjs/checks.json`: how each item is checked. An item marked `lint` or `script` is decided
  by the `lint` script or by `scripts/check-conventions.mjs`, not by this review: the script leaves
  it out of every section, and a reviewer writes no result and no finding for it.
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
| model | The model the reviewers and verifiers run on. | Sonnet in Claude, Terra in Codex, Hydrogen in AntiGravity. Anywhere else, the model running this skill. |
| departures | Path to the target's departures list. | Found by its configuration or its heading; see step 2. |
| previous | A `findings.json` from an earlier run, to list what is resolved since. | None. |

Take the inputs from the request. Do not ask for one that has a default. "Review this branch" or
"before the pull request" means `diff` against the branch's base.

Left out by default: example code (a folder named `example` or `examples`, a `*.example.ts`
file), output (`build`, `dist`, `coverage`, `tmp`, `.adonisjs`, `node_modules`), the generated
`database/schema.ts`, a package's `docs/` folder and prose (every Markdown and HTML file except
the root `README.md` and `CHANGELOG.md`). Review one only when the request names it, by adding
its folder or path to `include`.

## Rules

- Read-only on the target. Write only inside the run folder. Open no issue, post no comment,
  change no code and no departures list.
- A finding is an item id, a `path:line`, the quoted sentence of the item and the quoted code.
  No opinion, no cause, no fix.
- Review only the files in `files.json`. With a diff, a finding is on a line the diff changed.
  The one finding outside `files.json` is about a file an item requires and the root does not
  have.
- Something no item covers is not a finding. Leave it out.
- A guideline gets at most one finding per item.
- A finding a numbered departure or an Aligning entry covers is still recorded, with that
  entry's number.
- A departure is a numbered entry in the departures list and nothing else. A policy written
  anywhere else, or stated in the request, is not one: the finding is recorded without a number.
- A wording decision is in the checklist. Do not carry one over from an earlier review.
- Do not guess. When the item's wording does not decide a case, first run `report item <id>`: it
  prints the item, its cookbook entry and the items they cite, and one of those often decides
  it. When none does, it is not a finding: record it under `unclear` as one question, with the
  ids read in `read`. Propose no answer and no looser reading. That list is how the checklist
  gets better.

## Steps

### 1. Fix the root and the kind

- An application root is a folder with `adonisrc.ts`. A package root is a folder with a
  `package.json` that lists `@adonisjs/core` in a dependency list and no `adonisrc.ts`; it need
  not have a `configure.ts`. A frontend root is a folder with `package.json`, no `adonisrc.ts`
  and no `@adonisjs/core` in any dependency list: it is not server code, and only three sections
  cover it.
- A folder that only holds other roots is not a root: one whose `package.json` has `workspaces`,
  or that has a `pnpm-workspace.yaml`, and has no `adonisrc.ts`.
- The root is the target, or the nearest folder above it that is one of these. When the target
  holds several roots, do one complete run for each.
- The kind is `application`, `package` or `frontend`. `report list <kind>` prints the sections that apply.
- Paths in every record are relative to the root.

### 2. Find the departures list

Use the given path. Otherwise, when the target's repository root has a `conventions.config.json`
with `departures.file`, use that file. Otherwise search the target repository's Markdown files
for a heading that contains "departures". When several files have one, the list is the file
whose heading is followed by numbered entries, not one that only links to it. Record the path,
relative to the target's repository root, or `null` when there is none. With `null`, no finding
carries a departure number.

### 3. Create the run folder and prepare it

`<repository root of the target>/.conventions-review/<UTC time as YYYYMMDDTHHMMSSZ>/`. With
several roots, each run has its own folder: add `-` and the root's folder name to the time. Write
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
`null`. `sections` is the slugs chosen, in checklist order, or the string `"all"`: every section
of the kind, without `applications/tests` when the scope is `code`, and only the sections of part 1
and the section about tests when the scope is `tests`. `report list <kind>` prints
the slugs on standard output, one per line with a tab after each.

Run `report prepare <run folder>`. It writes:

- `files.json`: the files in this review, and with a diff the changed line ranges of each. A
  diff covers what the working tree changed since it left the base, committed or not.
- `checks/<section>.json`: each mechanical check of each section, with the items it supports.
  One the script ran has the lines it printed. One it cannot run, such as a script of the
  target or a build, is marked `not run`.

When `files.json` lists no file, stop and say so.

### 4. First pass: one reviewer per section

Give each section to one reviewer on the reviewer model. Run the reviewers at the same time when
the environment can start sub-agents; otherwise do the sections in turn. With one or two sections,
do them yourself. Sections that read the same files may share one reviewer, and a small repository
may have one reviewer for all of them: it still writes one record for each section.

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
   and "Every change" means every file in it. When no file matches, an item is n/a with the
   reason "no file in scope". The exception is an item that requires a file to exist, in a
   review of the whole root (scope `both`, folder `.`, no diff): a required file that is
   missing is a fail, written as step 4 says.
2. Reads its checks file. Each printed line is a place to read; the item decides. It runs no
   check itself and records none. A check marked `not run` supports nothing: the item is judged
   from the files, and one the files cannot decide is n/a with the reason "not decidable from
   the files".
3. Reads every picked file in full, and gives each item one result: `pass`, `fail`, `n/a`,
   `departure` or `unclear`. `unclear` is for an item with an unclear case and no finding. An item with several sentences passes only when every sentence holds. An item
   that passes although a check that names it, and expects no line, printed lines needs a
   `reason`. A guideline about
   how a file was made, which the files do not show, is n/a with the reason "not decidable from
   the files".
4. Writes one finding for each place an item fails, quoting the code exactly as the file has it.
   Where an item fails because something is absent, `code` is empty and `observed` says what is
   absent and where it was looked for. When the absent thing is a file, `path` is where the
   item says the file belongs.
5. Reads the departures list. A finding an entry covers gets that entry's number, as an
   integer, in `departure`. A law is covered only by an entry marked **Aligning**. Such a
   finding is not verified in the second pass.
6. Writes `sections/<slug with "/" replaced by "--">.json`:

```json
{
  "reviewer": "controllers-reviewer",
  "files_read": ["app/controllers/projects_controller.ts"],
  "items": [
    { "item": "CTL-1", "result": "pass" },
    { "item": "CTL-6", "result": "fail" },
    { "item": "CTL-7", "result": "unclear" },
    { "item": "CTL-10", "result": "n/a", "reason": "not decidable from the files" }
  ],
  "findings": [
    {
      "item": "CTL-6",
      "path": "app/controllers/projects_controller.ts",
      "line": 42,
      "sentence": "A controller does not catch an exception to answer with an error",
      "code": "} catch (error) {\n  return response.status(500).send({ error })",
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
  writing it. Each quoted line may be a part of its line in the file, so indentation may be
  left off. `line` is `null` when `code` is empty.
- Write a place once: the script keeps one finding for the same sentence at the same line. `observed` is one factual line, used only when the two quotes do not show the
  failure on their own. Leave it empty otherwise.

### 5. Check the records

Run `report build <run folder>`. It rejects, among others: an item with no result, a fail with
no finding, a sentence that is not in the item, a code quote that is not in the file, a file
that is not in `files.json`, a line the diff did not change, a second finding on a
guideline, a departure number that is not an entry of the departures list, and an unclear case
that proposes an answer or has not read the items cited. Send each rejected record back to its reviewer once. A record that is still rejected
is corrected by you from the file.

### 6. Second pass: verify

`build` wrote `verify.json`: every finding still to verify, with the item's full text, the
quoted sentence, the path, the line, the code and `index`, its place in the `findings` of its
section file, counted from 0. It leaves out what the reviewer observed, except for a finding
with no code, where that is the only statement of what is absent.

Give `verify.json` to a verifier on the reviewer model that wrote none of those findings. For
each entry the verifier:

1. Opens the file and reads the whole function or block around the line. For a finding with no
   code, looks for the absent thing where `observed` says and wherever else it could be.
2. Writes down, in one line, what that code does, or what is there in place of the absent
   thing. This comes before any judgement.
3. Answers one question: does that code fail the quoted sentence, as the item is written? A
   finding that needs a reading the item's words do not state is false.
4. In the entry's `section_file`, adds to the finding at `index` `"verified": true` or `false`,
   `"verify_note"` with the line from step 2, and `"verifier"` with its own name, which is not
   the reviewer's.

The verifier adds no finding. There is no third pass. A verdict written before the code was read
is not a verdict: `build` rejects one with no `verify_note`.

With many findings, use one verifier for each `section_file`, at the same time. No two verifiers
write the same file.

### 7. Build and report

Run `report build <run folder>`, with `--previous <findings.json>` when one was given. It writes:

- `findings.json`: every finding with a `key` that survives a file rename, its tier and the cookbook item that shows
  the pattern to follow; the findings the second pass rejected; the findings resolved since the
  previous run; and the result of every item and every check.
- `report.md`: the same as tables. Findings by tier, then the coverage of every item.
- `unclear.md`, when a reviewer recorded an unclear case: the body of an issue for the
  conventions repository, grouped by item.

Answer with the path of `report.md`, the count of law, rule and guideline findings, the count of
items failing and of places they fail at, the count not verified, and the count of files left out.
Call them findings against the checklist, not bugs: a tier is not a severity. Say which sections had no file in scope. When
`unclear.md` exists, give its path and say it is ready to file. Do nothing further unless asked.

## What comes after

Not part of this skill; each needs its own request.

- `unclear.md` filed as an issue in the conventions repository, and each question settled there
  as `workflow.md` says under "Settling an unclear case", before any code changes.
- One issue per failed item, holding the item text, the cookbook item and every location from
  `findings.json`.
- The fix, by a stronger model than the reviewers.
- The done-test: this skill again, for the item's section and folder, with `previous` set to the
  earlier `findings.json`. The item no longer appears and the earlier findings in the files
  reviewed are listed as resolved. A finding in a file outside this run stays open.
