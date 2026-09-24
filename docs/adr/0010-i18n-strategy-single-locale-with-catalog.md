# i18n: single Korean locale in MVP, no catalog runtime

FeedbackOps MVP has one document locale: `<html lang="ko">`. There is no locale
switcher and no `Accept-Language` negotiation. ADR-0005 names the
Reporter-Facing VOC Status labels in Korean. This ADR is how the rest of the
interface gets its words.

## Amended 2026-09-24

The i18next catalog this ADR originally specified was never added.
`apps/frontend/src/i18n/` does not exist. `i18next` and `react-i18next` are
not dependencies. The sections below replace "Library and structure", "What
gets translated through i18next", the locks, and the reopening rules. The
original mechanism is kept at the bottom so the history is not silent.

## Where a string lives

Wording still comes from the user-facing copy chain in root `AGENTS.md`
(prototype, then `docs/frontend/specs/`, then `CONTEXT.md`). The code does
not look that wording up in a catalog.

- **A string the component owns** sits in that component. The shared
  progress-notes panel keeps a `COPY` object in
  `apps/frontend/src/features/cross-system/progress-notes/ProgressNotesSection.tsx`
  (Korean when the resource is a Finding, English when it is a Task). Finding
  and Task both use that component. Source-context labels are the `LABELS`
  map in
  `apps/frontend/src/features/voc/components/create/SourceContextSegmented.tsx`.
  A new label of this kind goes next to the component that renders it.
- **A closed display set that already has a map** extends that map.
  `apps/frontend/src/lib/copy/` has two: `home.ts` (`HOME_COPY` and the
  queue/coverage maps; Korean and English in the same object) and
  `reporter-status-labels.ts` (`REPORTER_STATUS_LABELS`). Do not start a
  third file for one string.
- **An API error** is a `CATALOG` entry in
  `apps/frontend/src/lib/api/errorMapper.ts`, keyed by `ErrorCode`.
  `errorMapper` uses that entry and ignores the envelope `message` when a
  screen calls it. A code with no entry renders `GENERIC_ERROR_MESSAGE`.
  `errorMapper.test.ts` fails unless every `ERROR_CODES` value is in
  `CATALOG` or in `RETIRED_OR_SERVER_ONLY_CODES`. That test classifies
  codes. It does not check that every screen calls the mapper. `ApiError`
  keeps `envelope.message`. `useTaskRequestLink.ts` still does
  `toast.error(err.envelope.message)`, and `useTaskRequestDecision.ts`
  puts that string in the decision dialog, or in a toast when no dialog
  is open. Those screens are debt. A new screen uses `errorMapper`, not
  the raw message. Adding a code (ADR-0012) classifies it in the same
  change. A user-facing code adds a `CATALOG` entry. A code with no user
  copy is listed in `RETIRED_OR_SERVER_ONLY_CODES` instead
  (`not_implemented.todo` is the current member). Leaving it unclassified
  fails the test.
- **Data** is stored verbatim and rendered as-is: VOC titles, Public Update
  text, Internal Comment bodies, Reporter Reply content, Task titles.

Korean and English may sit in the same screen. Do not translate one side
into the other to make a file consistent. `PRODUCT.md` states the same rule.

## Backend

The backend does not translate. Error `message`, validation text, and audit
summaries stay English. A screen that calls `errorMapper` maps `code`
through `CATALOG` and does not show `message`. Screens that read
`ApiError.envelope.message` still show the English string. The error bullet
above names the ones that do.

ADR-0014's notification envelope described an insert-time i18next lookup for
a Korean `summary`. That module was not built, and there is no catalog to
look up. Building it by adding i18next is not this ADR. A backend that
writes user-facing Korean at insert time is a new ADR.

## Reporter-Facing VOC Status

ADR-0005's Korean list (`접수됨` … `종료됨`) is the reporter-visible label.
The column `voc.vocs.reporter_facing_status` stores the English keys
`received`, `reviewing`, `assigned`, `progress`, `prep`, `resolved`,
`reopened`, `closed`. Two maps render the Korean label, and both copy the
prototype list: `REPORTER_STATUS_LABELS` in
`apps/frontend/src/lib/copy/reporter-status-labels.ts`, and `LABELS` inside
`packages/ui/src/badges/ReporterStatusBadge.tsx`, which the badge renders.
`VocRow` and `IdentitySection` use that badge. Changing a label updates both
maps. The original text of this ADR, which stored the Korean string and
rejected a render-time map, did not ship.

## What this ADR locks

- One document locale, Korean (`lang="ko"`). No second locale and no
  switcher in MVP.
- No i18next, no `apps/frontend/src/i18n/` tree, no JSON namespace catalogs.
- Chrome is a literal at the component, or an existing map in
  `apps/frontend/src/lib/copy/`.
- API error copy for new user-facing work is a `CATALOG` entry in
  `errorMapper.ts`. A code with no user copy is classified in
  `RETIRED_OR_SERVER_ONLY_CODES` instead of `CATALOG`. The mapper ignores
  the English `message` when called. Existing screens that toast or render
  `envelope.message` directly are debt, not the rule.
- Backend does not translate.
- Reporter-Facing status keys stay English in the database. Korean labels
  stay in both `REPORTER_STATUS_LABELS` and `ReporterStatusBadge`'s
  `LABELS`. A label change updates both.
- User-generated content is stored verbatim.

## Reopening

Adding a second locale, a locale switcher, or a catalog runtime (i18next,
FormatJS, Lingui, or a JSON tree under `src/i18n/`) warrants a new ADR.
Moving translation into the backend warrants a new ADR.

Adding a label by the rules above is not a reopen.

## Superseded mechanism

The original decision (kept here, not in force) was: `i18next` plus
`react-i18next`, catalogs at `apps/frontend/src/i18n/<locale>/<namespace>.json`,
namespaces named after feature folders, eager load, FormatJS and Lingui
rejected. UI chrome would translate through that catalog. Reporter-Facing
status would be stored as the Korean string so a later English locale would
add a label lookup instead of migrating the enum. A second locale would add
catalog files beside `ko-KR/` and would reopen only for locale resolution.
None of that tree was created.
