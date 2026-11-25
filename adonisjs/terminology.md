# Terminology

One word per concept, and one concept per word, in code, comments, tests, commit messages,
documentation and the UI.

The words the framework owns are the [AdonisJS vocabulary](./cookbook.md#vocabulary).
This page holds the rules that apply to every word, and the format a repository uses for its own.

## Rules

1. **A framework word means only the framework thing.** AdonisJS, Lucid, VineJS, Japa, Bouncer and
   Ace own the words in the AdonisJS vocabulary. A repository that uses other libraries lists the
   words they own beside its product words. Product code does not reuse a reserved word for
   anything else.
2. **One concept, one word.** A repository's product words list the rejected synonyms. A rejected
   synonym is a defect when it is found, not a style preference.
3. **Code word and UI word match**, unless the entry records a deliberate pair.
4. **Package, header and package-config names keep their own spelling**: `Idempotency-Key`,
   `Content-Security-Policy`, `E_*` codes.
5. **Spelling.** Prose, UI copy and product-concept identifiers use British spelling (`utilisation`,
   `anonymise`, `colour` in copy, `catalogue`, `favourite`). Generic programming identifiers that
   mirror a platform or library keep American spelling (`color`, `normalize`, `serialize`,
   `initialize`, `authorization`). Write "AdonisJS", never "Adonis".

## Enforced rejections

`scripts/check-terminology.mjs` reads this table between its markers and fails on a rejected
synonym in a file name or in the text of a tracked file. A repository's own dictionary carries the
same table, between the same markers, for its product words; the check reads both. The words in
the AdonisJS vocabulary that also have an ordinary meaning (guard, policy, exception, service,
command) cannot be checked this way; a reviewer applies VOC-1 and VOC-3 to them.

Run it from the repository to check: `node <path to this repository>/scripts/check-terminology.mjs`.
A repository that wants the check in its own scripts installs this repository as a development
dependency and runs `check-terminology`. Its `terminology.config.json` names its dictionary and its
exemptions; the head of the script gives the format.

<!-- terminology:enforced:start -->

| Rejected | Say | Entry |
| -------- | --- | ----- |
| adonis | AdonisJS | VOC-2 |

<!-- terminology:enforced:end -->

## Product words

Each repository defines its own, in a file at its root, in these two tables. A rejected synonym is
listed once, against the word that replaces it.

### Architecture words

| Word | Means | Instead of |
| ---- | ----- | ---------- |

### Domain words

| Concept | Code | UI and docs | Rejected |
| ------- | ---- | ----------- | -------- |
