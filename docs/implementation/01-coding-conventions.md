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

