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
10. **Same-slice overlap.** If an issue merged earlier in this slice touched the same component, hook, endpoint or
    doc section (`git log origin/develop --since=<slice start> -- <paths>`), the brief names that change and keeps
    its behaviour.
11. **Commands and flags exist.** Every CLI command and flag the brief tells the worker (or the conductor) to run is
    confirmed with `--help` or the tool's docs (s70: `pnpm patch --offline` does not exist). Dependency changes are
    pre-installed by the conductor (`PRE_ADD`); a brief never asks a worker to install, add or patch packages.
12. **Lifecycle code facts.** For focus, mount, animation or async-ordering behaviour: library timing comes from the
    installed source (`node_modules/...`, file:line), not memory; the design writes no refs and reads no DOM during
    render, and does not rely on TanStack per-call `mutate(vars, { onSettled })` for cleanup (it does not run for
    superseded mutations — use `mutateAsync` or the hook). s70: both #995 first designs and #997's first fix broke
    on these.

Added after s81 (each a `grep`, not a review round; together they cost five fix rounds there):

13. **Changed field, predicate or contract: every consumer listed.** When the brief removes, hides or renames a
    response field, permission predicate or scope rule, or changes a shared contract, the brief lists every
    serializer, projection and endpoint that emits the field or applies the predicate (recommendation candidates,
    sorts, counts, lists and summaries, Admin shortcuts, archived-scope variants) and every existing test, backend
    and frontend, that pins the old value or builds the now-invalid state (#1173, #1170a, #1179, #1172).
14. **Shared component given a new meaning.** When the brief changes a shared component's accessible name, label or
    markup, it lists the component's other consumers (`rg '<Component'`) and decides each one (#1173: Priority
    picked up the Severity name).
15. **New link or label on a screen.** The brief lists the visual specs and tests whose
    `getByRole(…, { name })` locator could now match twice under strict mode (#1174b).
16. **Values the UI sends are accepted.** Every value the brief tells the UI to send (a `null` scope, an enum, an
    omitted field) is checked against the receiving endpoint's validator: strict schemas, supported scope
    candidates (s81: `POST /permission-requests` rejects a workspace-wide `voc.read` with 422
    `supportedScopeCandidates`).

## Report

Write the report your task names. It starts with `## Summary`, **at most 25 lines**: the verdict (`ready` or
`fix brief`), then one line per finding (ID, check item, brief line, the defect). Then `## Patch`: each correction
as a replacement pair (`Replace:` the brief's sentence / `With:` the corrected sentence) the conductor can apply
without rereading a narrative, ordered by the round it would cost. Evidence goes in `## Details`. End with the
sentinel line your task gives, exactly.
