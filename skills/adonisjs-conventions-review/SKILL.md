---
name: adonisjs-conventions-review
description: Review an AdonisJS application or package against the AdonisJS conventions checklist and write a structured list of findings (findings.json and report.md). Takes a repository or a folder, a scope (code, tests or both), the checklist sections to run (or all) and an optional reviewer model. Read-only, it reports and never fixes. Use when asked to check, audit or review code against the AdonisJS conventions or the checklist.
---

# AdonisJS conventions review

The review answers one question for each item: does this code match the item? It does not ask
whether the code is good, and it does not propose a fix. The output is evidence a later change is
built on.

The checklist and its procedure are in the repository this skill belongs to. Find it with
`realpath` on this skill's folder: the repository root is two folders up. From there:

- `adonisjs/checklist.md`: the items. Never work from a copy or from memory.
- `workflow.md`: the tiers, when n/a is valid, departures. Read it before the first review.
- `skills/adonisjs-conventions-review/scripts/report.mjs`: called `report` below. Run it with `node`.

## Inputs

| Input | Values | Default |
| --- | --- | --- |
| target | A repository, or a folder in one. | The current directory. |
| scope | `code`, `tests`, `both`. | `both` |
| sections | Section slugs from `report list`, a part (`every-change`, `applications`, `packages`), or `all`. | `all` |
| model | The model the reviewers run on. | Sonnet in Claude, Terra in Codex. |
| departures | Path to the target's departures list. | Found by its heading; see step 2. |
| previous | A `findings.json` from an earlier run, to mark each finding new or open. | None. |

Take the inputs from the request. Do not ask for one that has a default.

## Rules

- Read-only on the target. Write only inside the run folder. Open no issue, post no comment,
  change no code and no departures list.
- A finding is an item id, a `path:line`, the quoted sentence of the item and the quoted code.
  No opinion, no cause, no fix.
- Something no item covers is not a finding. Leave it out.
- A guideline gets at most one finding per item.
- A finding a numbered departure or an Aligning entry covers is still recorded, with that
  entry's number.
- Do not guess. When the item's wording does not decide a case, it is not a finding: record it
  under `unclear` with the question the wording leaves open. That list is how the checklist
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
there is none. With `null`, no finding
carries a departure number.

### 3. Create the run folder

`<repository root of the target>/.conventions-review/<UTC time as YYYYMMDDTHHMMSSZ>/`, with a
`sections/` folder in it. Write `.conventions-review/.gitignore` containing `*` so the folder is
never committed. Then write `run.json`:

```json
{
  "root": "/absolute/path/to/the/root",
  "commit": "<git rev-parse --short HEAD of the target>",
  "folder": "app/controllers",
  "kind": "application",
  "scope": "both",
  "sections": ["every-change/names", "applications/controllers"],
  "model": "<the reviewer model>",
  "departures": "DECISIONS.md"
}
```

`folder` is the target relative to the root, `.` for the whole root. `sections` is the slugs
chosen, in checklist order; `all` is every slug `report list <kind>` prints.

### 4. First pass: one reviewer per section

Give each section to one reviewer on the reviewer model. Run the reviewers at the same time when
the environment can start sub-agents; otherwise do the sections in turn. With one or two sections,
do them yourself.

A reviewer is given, and needs nothing else:

- The section text from `report section <slug>`, verbatim.
- The n/a rule and the tier table from `workflow.md`, verbatim.
- The root, the folder, the scope and the path of the departures list.
- The "Rules" above and the record format below.

A reviewer does this:

1. Lists the files the section is about, inside the folder and the scope. Read the section's
   *When* line as "the folder holds": "You touched a controller" means the controller files in
   the folder, and "Every change" means every file in the folder. `code` is every file outside `tests/` that is not a `*.spec.ts` file; `tests` is
   the rest. When no file matches, every item is n/a with the reason "no file in scope".
2. Runs the section's mechanical checks from the root. A check points at lines to read; the item
   decides. A check that cannot run is recorded as `not run` with the reason. Record the
   section's checks only; a search of your own is not a check.
3. Reads every listed file in full, and gives each item one result: `pass`, `fail`, `n/a` or
   `departure`. An item with several sentences passes only when every sentence holds. A
   guideline about how a file was made, which the files do not show, is n/a with the reason
   "not decidable from the files".
4. Writes one finding for each place an item fails, quoting the code exactly as the file has it.
   Where an item fails because something is absent, `code` is empty and `observed` says what is
   absent and where it was looked for.
5. Reads the departures list. A finding an entry covers gets that entry's number, as an
   integer, in `departure`. Such a finding is not verified in the second pass.
6. Writes `sections/<slug with "/" replaced by "--">.json`:

```json
{
  "section": "applications/controllers",
  "files_read": ["app/controllers/projects_controller.ts"],
  "checks": [
    { "command": "grep -rn \"try {\" app/controllers", "result": "output", "note": "2 lines" }
  ],
  "items": [
    { "item": "CTL-4", "result": "fail" },
    { "item": "CTL-5", "result": "pass" },
    { "item": "CTL-10", "result": "n/a", "reason": "no resource controller in the folder" }
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
      "question": "Does `response.send()` count as a helper that names the status?"
    }
  ]
}
```

- `checks[].result` is `as stated`, `output` or `not run`.
- `items` has every item of the section, once. `n/a` needs a `reason`.
- `sentence` is copied from the item. `code` is copied from the file; check it is there before
  writing it. `observed` is one factual line, used only when the two quotes do not show the
  failure on their own. Leave it empty otherwise.

### 5. Check the records

Run `report build <run folder>`. It rejects an item with no result, a fail with no finding, a
sentence that is not in the item, and a code quote that is not in the file. Send each rejected
record back to its reviewer once. A record that is still rejected is corrected by you from the
file.

### 6. Second pass: verify

Give every finding with no departure number to a verifier that did not write it, on the reviewer
model. A reviewer never verifies its own findings. The verifier gets the finding, the item's full text and the file. It opens the file and
answers one question: does the quoted code fail the quoted sentence? It writes `"verified": true`
or `"verified": false` with a one-line `"verify_note"` into the finding in the section file. It
adds no finding. There is no third pass.

### 7. Build and report

Run `report build <run folder>`, with `--previous <findings.json>` when one was given. It writes:

- `findings.json`: every finding with a stable `key`, its tier, the cookbook item that shows the
  pattern to follow, and `status` (`new` or `open`); the findings the second pass rejected; the
  findings resolved since the previous run; and the result of every item.
- `report.md`: the same as tables. Findings by tier, then the coverage of every item.

Answer with the path of `report.md`, the count of law, rule and guideline findings, and the
count not verified. Say which sections had no file in scope, and list the `unclear` entries. Do nothing further unless asked.

## What comes after

Not part of this skill; each needs its own request.

- One issue per failed item, holding the item text, the cookbook item and every location from
  `findings.json`.
- The fix, by a stronger model than the reviewers.
- The done-test: this skill again, for the item's section and folder, with `previous` set to the
  earlier `findings.json`. The item no longer appears and the earlier findings are listed as
  resolved.
