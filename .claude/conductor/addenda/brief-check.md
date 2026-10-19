## FeedbackOps addendum (base ref `origin/develop`)

Examples and paths for the shared items (each cost a review round in sessions 63–65 and s81):

- Items 13–16 were added after FeedbackOps s81, where together they cost five fix rounds.
- Item 1: a brief that said "parse with the shared schema" made a worker invent one (#813). Named things include
  copy keys (`apps/frontend/src/lib/copy/*`).
- Item 2: cardinality and validation rules match the backend validator (`routes.ts`, `authoring.ts`, service code),
  not the issue text (#827).
- Item 3: a sequence that cannot hit the race passes before the fix (#891).
  s90 #1292: an "own mutation vs refetch" test delayed the list read by 100 ms and passed, while the running app
  failed; `onSuccess` awaits the invalidations, so settle and the refetched render land in one batch. Pin the real
  order (POST resolves → settle → refetch renders) in the brief.
- Item 4: integration tests send the body the frontend sends (#921).
- Item 5: lifecycle events (#838).
- Item 6: mount lifetime (#922 → #937).
- Item 7: waiting guards, scroll end or acknowledgement (#901).
- Item 8: removed markup, `getByRole` and test ids under `src/` (#798).
- Item 9: capped searches keep exact hits (#821).
- Item 11: s70: `pnpm patch --offline` does not exist.
- Item 12: s70: both #995 first designs and #997's first fix broke on these. Do not rely on TanStack per-call
  `mutate(vars, { onSettled })` for cleanup (it does not run for superseded mutations — use `mutateAsync` or the
  hook).
- Item 13: examples #1173, #1170a, #1179, #1172.
- Item 14: #1173: Priority picked up the Severity name.
- Item 15: #1174b.
- Item 16: s81: `POST /permission-requests` rejects a workspace-wide `voc.read` with 422
  `supportedScopeCandidates`.
