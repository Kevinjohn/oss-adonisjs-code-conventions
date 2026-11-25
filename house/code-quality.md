# Code quality

- Remove editing residue. Comments describe the code's contract or explain a decision; never
  leave drafting instructions, temporary defect labels or implementation-plan references.
- Make guarantees match execution. Claims such as "atomic", "validated", "retryable" or
  "read-only" must hold across the actual call path and relevant failure cases.
- Remove retired workflows completely within the affected scope. Trace their types, exports,
  consumers, storage keys, URL parameters, tests and documentation. Keep historical structures
  where a current dependency or compatibility requirement needs them.
- Avoid interfaces without behavior. Do not add no-op callbacks, unused resolvers, speculative
  extension points or abstractions without a concrete consumer.
- Trace control flow before adding guards. Avoid checks already guaranteed by an earlier return,
  a trusted producer or the owning layer. Preserve validation at real trust boundaries.
- Preserve failure meaning. Catch expected failures narrowly. Do not turn unexpected exceptions
  into ordinary conflicts, success, empty results or misleading warnings.
- Test the claimed boundary. A helper test proves the helper; it does not prove server
  enforcement, authorization or transaction behavior.
- Check that tests distinguish failure from success. Use realistic mocks and assert the intended
  outcome. Ensure a test cannot pass because an unrelated error occurred first.
- Stage timing-sensitive behavior explicitly. Use controlled pending responses or barriers to
  test dismissal, identity changes and stale results; avoid arbitrary sleeps.
- Keep documentation tied to the current product. Verify control names, screenshots, captions,
  examples and story ownership against the implemented journey. Preserve explicit target
  requirements where implementation is still tracked as incomplete.
- Measure before optimizing or abstracting. Establish a concrete cost or maintenance problem,
  then choose the smallest change that addresses it.
- Close findings with evidence. Record each finding as fixed, superseded or deliberately retained
  with a reason. Green checks alone do not establish that the original requirement is satisfied.

Trace the whole behavior before declaring an edit complete: who produces the value, who consumes
it, what happens after an interruption, and what evidence would expose a mistake. Apply these
checks within the requested scope; they do not authorize unrelated cleanup or additional gates.
