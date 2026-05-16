# i18n: single ko-KR locale in MVP, catalog structure prepared for expansion

FeedbackOps MVP ships with one user-facing locale: **ko-KR**. ADR-0005 already locked Reporter-Facing VOC Status as Korean DB-stored enum values (`접수됨`, `처리 중`, etc.). This ADR extends that decision to the rest of the user interface and chooses the loading mechanism.

## Library and structure

We use **`i18next` with `react-i18next`** on the frontend. Catalog files live under `apps/frontend/src/i18n/<locale>/<namespace>.json` and load eagerly for MVP because the bundle is small. Namespaces match feature folders (`home`, `my-work`, `voc`, `surveys`, `tasks`, `integration`, `admin`, `common`) so feature ownership stays clear.

FormatJS and Lingui were rejected for MVP: FormatJS adds ICU MessageFormat complexity we do not need with a single locale, and Lingui's compile-time extraction adds a build dependency without an offsetting win on this size.

The backend does **not** translate. Every user-visible string the backend emits — error messages, validation failures, audit summary lines — is a stable English key plus structured detail; the frontend translates at render time. This keeps backend logs, audit rows, and API responses uniform regardless of viewer locale.

## Reporter-Facing VOC Status stays as Korean DB values

The enum stored in `core.voc.reporter_facing_status` is the Korean string itself (`접수됨` ... `종료됨`), as locked by ADR-0005. We rejected the alternative ("store English keys, translate at render") for three reasons:

1. **Audit clarity**: `core.audit_log.detail` recording a Reporter-Facing status change must say exactly what the Reporter saw at that moment. English keys would require a second lookup to reconstruct.
2. **Cross-system safety**: ADR-0005 says no automatic mapping from Task Status to Reporter-Facing status. Storing English keys would invite a "since both sides are English, why not just map" temptation.
3. **Expansion path**: if we add English locale later, we add a `reporter_facing_status_label_en` view or catalog entry keyed by the Korean enum value. The enum itself never has to migrate.

## What gets translated through i18next

Everything that is **UI chrome** (navigation, button labels, table headers, panel titles, empty-state copy, form labels, validation hint text) translates through i18next. Everything that is **data** (VOC titles, Public Update text, Internal Comment bodies, Reporter Reply content, Reporter-Facing VOC Status enum, Task title) is stored verbatim and rendered as-is. Backend error codes translate at the frontend boundary via a per-code message lookup.

## What this ADR locks

- Single ko-KR locale in MVP.
- i18next + react-i18next as the library; namespaces match feature folders.
- Backend emits stable English keys and structured detail; never translates.
- Reporter-Facing VOC Status enum values stay Korean in the database.
- User-generated content is stored verbatim, never translated.

## Reopening

Adding a second locale (most likely `en`) means:

1. Adding the locale's catalog files alongside `ko-KR/`.
2. Adding a `reporter_facing_status_label_en` lookup, **not** changing the enum values.
3. Choosing a locale resolution strategy (Actor preference, `Accept-Language`, etc.) — this is the part that warrants the new ADR.

Replacing i18next or moving translation to the backend warrant new ADRs of their own.
