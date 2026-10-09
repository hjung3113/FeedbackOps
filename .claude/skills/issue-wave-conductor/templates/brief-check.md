# Brief check — before the implementer starts

You check an implementation brief, not code. Read-only: the only file you write is your report. Do not edit,
format, commit, stash or checkout. Read-only shell (`git log`, `rg`, `sed -n`) is fine. Your task names the brief
and the report path; this checkout sits at the current `origin/develop`, the code the brief will change.

Each finding names the brief line, what is wrong on `origin/develop`, and the corrected wording. Report only
defects that would cost a review or fix round; style and wording preferences are out of scope.

## What to check (each one cost a review round in sessions 63–65)

1. **Named things exist.** Every path, helper, schema, hook, test file, copy key and line number the brief names
   exists on `origin/develop` and does what the brief says. A brief that said "parse with the shared schema" made a
   worker invent one (#813).
2. **Rules are copied, not remembered.** Cardinality and validation rules (one parent vs many children, required
   fields, ranges) match the backend validator (`routes.ts`, `authoring.ts`, service code), not the issue text
   (#827).
3. **Regression tests reach the bug.** Trace each test sequence the brief prescribes through the current code: it
   must enter the buggy branch, so removing the fix turns it red. A sequence that cannot hit the race passes
   before the fix (#891).
4. **Client contracts use the exact body.** Integration tests for a client-driven contract send the body the
   frontend actually sends (`grep` the call site), not a combined or idealised payload (#921).
5. **Lifecycle events are enumerated.** When behaviour hangs on an event ("closing collapses", "on tab switch"),
   the brief lists every representation the call sites use (absent prop vs `null`, unmount vs hide) (#838).
6. **Mount lifetime.** A change that keeps a component mounted across a context change (tab, route, scope) lists
   that component's local state (refs, optimistic sets, counters) and decides each one's lifetime (#922 → #937).
7. **Waiting guards end.** A guard that waits for an event (scroll end, acknowledgement) has a bounded release for
   the no-event path, and its test starts from a non-zero origin (#901).
8. **Removed markup has a test list.** A brief that removes a role, test id or label lists every test that queries
   it (`grep -r "getByRole('<role>'"` and the test ids under `src/`), and the worker runs those files (#798).
9. **Capped searches keep exact hits.** Replacing an exact lookup with a capped prefix or contains search keeps the
   exact hit reachable under the cap (#821).
10. **Same-slice overlap.** If an issue merged earlier in this slice touched the same component, hook or endpoint
    (`git log origin/develop --since=<slice start> -- <paths>`), the brief names that change and keeps its
    behaviour.

## Report

Write the report your task names: a verdict line (`ready` or `fix brief`), then findings ordered by
the round they would cost. End with the sentinel line your task gives, exactly.
