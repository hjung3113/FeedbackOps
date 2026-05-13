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
- routes.ts
- controller.ts
- application/
- domain/
- repository/
- read-models/
- tests/
```

## Frontend Feature Layout

```text
src/features/{feature}/
- routes.tsx
- screens/
- components/
- hooks/
- api.ts
- tests/
```

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
