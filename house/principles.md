# Design principles

- Prefer simple, modular designs with clear names and explicit interfaces. Smallest means
  maintainable, not fewest lines; avoid speculative abstractions.
- Keep files, functions and classes cohesive. Split oversized or mixed-responsibility units
  within the affected scope when this reduces reading context; preserve behaviour and verify
  the resulting boundaries.
- One responsibility per file: see [Single responsibility per file](./single-responsibility.md).
