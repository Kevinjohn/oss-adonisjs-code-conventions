# How to use these conventions

This page is the procedure for every checklist in this repository: what a failed item does, when an
item does not apply, how a difference is recorded and how a review runs.

## The one question

A review with a checklist answers one question: does this code match these items? It does not ask
whether the code is good. Something no item covers is not a finding. It is an issue that proposes
a new item, and the review goes on without it.

## Tiers

Each item carries the tier that says what a failure does.

| Tier | A failed item | Departure |
| --- | --- | --- |
| **Law** | Blocks the merge. | None that lasts. Only an **Aligning** entry, which names the issue that brings the code into line, and only until that issue lands. |
| **Rule** | Blocks the merge. | A numbered entry in the repository's departures list, decided in an issue before the code merges. |
| **Guideline** | Does not block. The reviewer notes it once and the author answers once, with a fix or a reason. | A reason that will stand is recorded as a departure, so the item is not noted again. |

- The tier printed on an item is the tier. Nothing on this page moves an item to another one.
- A law or a rule is decided from the repository: its files, its commands and its git history.
  An item that needs taste to decide is a guideline.
- An item with several sentences passes only when every sentence holds.
- **n/a** is valid when the item's condition is false: the section's *When* line does not match
  the change, or the item starts from something the code does not have ("a middleware the package
  ships", "when an action uses route parameters"). An item that requires something to exist is
  never n/a because that thing is missing: that is a fail.
- A departure is decided in an issue and lands in its own change, before the code that needs it.
  The change that needs a departure never adds it. The standard does not
  bend to a repository: code that does not meet an item yet gets an entry marked **Aligning**,
  which covers a law or a rule until the issue it names lands.
- A tier or an item changes through an issue, between reviews. A review in progress keeps the
  draft it started with.

## How to review with it

1. State the scope first: the lines a pull request changes, or the folders of a repository review.
2. Give every item in the sections that apply one result: pass, n/a, departure or fail. Check
   each n/a against the n/a rule above, and each departure against the numbered entry it cites;
   one that does not hold is a fail.
3. A finding names the item id, the `path:line`, and quotes the sentence of the item that fails.
   Without all three it is not a finding.
4. The first pass covers every item that applies. The second pass covers only the first pass's
   findings and the lines changed to fix them. A review has no third pass. A law or a rule that
   still fails after the second pass blocks the merge: the author fixes it and asks for a new
   review, which starts again at the first pass.
5. Cite the draft of the checklist the review used.
