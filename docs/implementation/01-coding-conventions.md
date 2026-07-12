# Coding Conventions

## TypeScript

```text
- Use TypeScript strict mode.
- Prefer explicit return types on exported functions.
- Use discriminated unions for status, visibility, and relation_type handling.
- Do not use stringly typed domain values outside schema or enum definitions.
```

## Naming

```text
Files:
- React components: PascalCase.tsx
- hooks: useThing.ts
- backend modules: kebab-case folders
- tests: *.test.ts or *.spec.ts

Types:
- API request DTO: CreateVocRequest
- API response DTO: VocDetailResponse
- domain model type: Voc
- enum-like union: VocStatus
- repository: VocRepository
- application service: CreateFindingFromVocService
```

Use current domain names in new contracts and migrations:

```text
- managed_system_id, not project_id, for MVP scope and permission boundaries.
- Primary Managed System in prose when describing the owning scope of a record.
- source_context for VOC source context enum values.
- reporter_facing_status for public VOC progress; task_status remains internal execution state.
- Work Initiative or Project only for future execution grouping, not MVP scope.
```

## Backend Module Layout

```text
src/modules/{module}/
- routes.ts            # Fastify route registration (HTTP parsing / response mapping)
- service.ts           # write / transaction / permission / audit orchestration
- *-service.ts         # sub-service split when needed (conversation-service.ts, read-service.ts, etc.)
- repo.ts / repo-read.ts   # write / read-only repositories (owned tables only)
- transitions.ts       # state transition rules (modules with state machines)
- cursor.ts            # cursor / pagination helpers when needed
- index.ts             # module assembly (deps injection, route registration export)
- __tests__/           # module tests
```

This is a flat-file convention. Do not introduce layered directories such as
`controller/`, `application/`, `domain/`, or `repository/`; service/repository
splits are expressed with file suffixes. The `core` module is the current
exception, with subdirectories such as `idempotency/`, `managed-systems/`,
`audit/`, and `jobs/`.

## Frontend Feature Layout

```text
src/features/{feature}/     # representative structure; feature-specific subsets/variants are allowed
- routes/              # route module directory (InboxRoute.tsx, etc.), not a single routes.tsx
- components/          # feature-local components
- hooks/               # typed API hooks
- lib/                 # API client + feature logic
- __tests__/           # feature tests
```

This is a representative structure; not every feature owns every folder. For
example, `voc-cluster/` currently owns only `hooks/`. There is no dedicated
`screens/` directory or `api.ts` convention; API calls live under `hooks/` and
`lib/`.

## Error Handling

```text
- API errors use stable codes.
- Validation errors identify field paths.
- Permission errors include requestable permission when safe.
- Cross-system command failures identify which phase failed.
```

## Comments

Comments should explain non-obvious domain or transaction decisions. Do not restate the code.

## Rich Content Storage

Rich-content implementations must preserve WYSIWYG-first input while keeping
storage and rendering safe:

```text
- Store rich content in structured editor documents or sanitized HTML approved by the backend contract.
- Store inline images as attachment references, never base64 body images.
- Do not render external image URLs inline in MVP.
- Store editor tables as structured rich content; require large spreadsheet-like data to be attachments.
- Enforce visibility on every attachment and rich-content render path.
```
