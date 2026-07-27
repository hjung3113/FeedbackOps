# `GET /actors` — workspace actor list

Small read endpoint used by the Triage `<OwnerPicker>` and any future
assignee-selection UI. Closes the post-Slice 3 #21 drift gap (FE shipped the
hook in #21, BE route registered post-#21).

## Contract

| | |
|---|---|
| Path | `GET /actors?workspace=current` |
| Auth | Required (any session). Intra-workspace read; no capability gate. |
| Workspace param | Pinned sentinel `current`. Other values → 422 `validation.failed`. |
| Order | `display_name ASC, id ASC` for stable iteration. |
| Status | 200 on success. 401 `auth.session_invalid` without session. 422 `validation.failed` on bad query. |

## Response

```json
{
  "actors": [
    { "id": "uuid", "display_name": "Mock Admin", "email": "admin@feedbackops.local", "role_level": "admin" }
  ]
}
```

`role_level` is the canonical storage form (`admin | developer | user`,
ADR-0006). The `kind: 'user' | 'team'` taxonomy used by `<OwnerPicker>` is a
FE-only mapping inside `useWorkspaceActors`; today every BE row maps to
`'user'` because the data model has no team actors (ADR-0018 teams stub).

## Schema

- Zod: `packages/shared/src/auth/list-actors.ts` → `listActorsResponseSchema`.
- BE: `apps/backend/src/modules/auth/list-actors-routes.ts`.
- FE consumer: `apps/frontend/src/features/voc/hooks/useWorkspaceActors.ts`.

## Drift guards

- Forward drift (BE→proxy): `apps/frontend/src/__tests__/vite-proxy-completeness.test.ts`.
- Reverse drift (FE→BE): `apps/backend/src/__tests__/fe-call-endpoints-exist.test.ts`.

Both discover backend routes by reading source, and both must parse **either**
fastify registration form — `app.route({ url: '/x' })` or the method shorthand
`app.get('/x', …)`. A form neither can see disappears from the check: the
reverse guard then reports a live route as missing (a false red the reader
learns to ignore), and the forward guard stops demanding a proxy entry for it
at all (a silent green). Both failure modes were live until #206.
