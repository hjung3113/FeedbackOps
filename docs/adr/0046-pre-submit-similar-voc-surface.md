# ADR-0046: Pre-submit Similar VOC Surface

Date: 2026-08-03

## Status

Accepted (2026-08-04). The three §Open questions were answered by the user on
2026-08-04; the answers are recorded in §Resolved open questions and are now
part of this decision.

## Context

Issue #293 asks for a similar-VOC surface before a reporter submits a new VOC.
The conductor read and verified the issue body directly. The confirmed
requirement is: "Before creating a duplicate VOC, the user can inspect strong
similarity candidates and either join/add context to the existing report or
explicitly continue with a new report." The reproduction was that a user
submitted a VOC describing the same symptoms as VOC-1000, and only after
VOC-1001 had been created did the detail screen show `Similarity 1` and a
VOC-1000 recommendation; the create screen had no pre-submit warning or join
action.

The shipped embedding recommendation resource is keyed by a persisted source:
`GET /vocs/:id/recommendations` takes a source ID (`apps/backend/src/modules/
voc/recommendations/routes.ts:48-63`); its service first loads that authorized
VOC, then requires its active-version stored vector (`service.ts:96-140`). Its
dismissal and confirmation writes likewise require both persisted VOC IDs
(`service.ts:179-243`, `service.ts:251-300`). A create form has neither.

ADR-0031 remains accepted alongside the resource when the provider is disabled
or the persisted source is not embedded (`docs/adr/0031-similar-voc-same-
managed-system-heuristic.md:43-47`). Its predicate is: active peers in the same
workspace and primary Managed System, visible only through `voc.read` scope or
the reporter arm, ordered `created_at DESC, id DESC`, capped at three
(`docs/adr/0031-similar-voc-same-managed-system-heuristic.md:18-20,49-57`).

FR-VOC-004 calls for embedding similarity, explicit confirmation, and
dismissal (`docs/design/04-voc-system.md:244-254`). It governs the saved-VOC
recommendation resource; it does not itself define an unsaved-draft protocol.

## Prototype fidelity

The create prototype derives `similar` as
`window.Vocs.filter(v => v.managedSystem === ms).slice(0, 3)`
(`docs/design-prototype/screen-voc-create.jsx:35-37`). The panel verbatim shows
`유사 VOC`, `{similar.length}건`, then for each item its `{v.title}` and
`{v.id} · {v.createdAt}` (`screen-voc-create.jsx:212-227`). Its data records
provide `id`, `title`, `managedSystem`, and `createdAt` (for example
`docs/design-prototype/data.js:70-82`).

There is **no** join, dismiss, confirm, “continue as new”, score, loading, or
unavailable-state action in that panel. Adding “join an existing report” or
“continue as a new report” would therefore be a prototype deviation and needs
explicit user approval plus a prototype update. This ADR does not invent it.

**Amendment 2026-08-04.** The panel's item was never non-interactive: the
stylesheet already gave `.similar-mini` `cursor: pointer` and a
`--surface-row-hover` hover background (`docs/design-prototype/styles.css`,
“Similar VOC mini cards”). The prototype declared the affordance and omitted
only the handler. Under the approved contract in §Resolved open questions the
prototype was amended to wire that existing affordance to
`onNavigate('voc', null, v.id)` — the same three-argument navigation other
prototype screens already use to open a record (`screen-voc.jsx:284,293`) — and
the item element became a `<button type="button">` with the class unchanged.
No copy, field, count, ordering, or new control was added.

The decision below matches the prototype's same-Managed-System, first-three
shape and displayed fields. Production must still substitute the ADR-0031
authorization predicate for the prototype's unrestricted `window.Vocs` filter;
that is a required security correction, not a visual/copy deviation.

## Decision

### D1 — Recommend the ADR-0031 heuristic for the pre-submit panel

Recommend **candidate B**: once a Managed System has been selected, read at
most three authorized active peers in the same workspace and Managed System,
newest first, and render exactly the prototype panel. Do not send draft title
or rich-content text to `EmbeddingProvider`, do not create a draft VOC, and do
not call the existing ID-keyed recommendation resource.

This is a separate, read-only pre-submit module with a small interface:
`{ managedSystemId } -> { items: PrototypeSimilarVocItem[] }`, where every
candidate is filtered in SQL with `actorReadScope` / the existing
`similarVocVisibilityPredicate`. The latter is already the sole SQL rule used
by both recommendation read and mutation pair loading
(`apps/backend/src/modules/voc/recommendations/repo.ts:153-179`). The create
screen already has the required selected Managed System and an empty right
`lg:col-span-3` column (`apps/frontend/src/features/voc/components/create/
VocCreateScreen.tsx:131-147,371-375`).

No similarity score or total beyond the returned items is exposed. A zero-item
result is a legitimate authorized-peer result, not an embedding failure.

**Field correction 2026-08-04.** Each item is
`{ id, display_id, title, created_at }`, not the `{ id, title, created_at }`
first written in §Implementation chunks. The prototype's rendered
`{v.id} · {v.createdAt}` is the human record label (`VOC-1000` in
`docs/design-prototype/data.js`), which in production is `display_id`; the UUID
`id` is separately required as the navigation target approved in §Resolved open
questions. Returning only one of the two would make either the rendered text or
the navigation impossible. No other field is added.

### D2 — Do not reuse saved-recommendation unavailable states for this panel

`provider_disabled` means no configured embedding provider; `source_not_embedded`
means a persisted source lacks an active-version vector
(`apps/backend/src/modules/voc/recommendations/service.ts:42-63,119-140`).
Neither predicate exists for an unsaved heuristic query. Therefore this panel
must not render either state and must not call it an embedding recommendation.

This does not violate ADR-0034 D2: D2 forbids the *embedding recommendation
surface* from silently returning an empty list when its provider is unavailable
(`docs/adr/0034-voc-embedding-similarity-infrastructure.md:53-69,135-140`). A
clearly separate ADR-0031 peer signal has no provider dependency. If a later
decision adopts preview embeddings, it must show the exact unavailable reason,
not replace it with a heuristic panel under an embedding label.

### D3 — Pre-submit display has no recommendation decision state machine

Do not expose dismiss or confirm actions in the pre-submit panel. ADR-0034's
state machine is `suggested -> dismissed | confirmed`, with dismissal scoped by
`(source VOC, candidate VOC, actor scope)` (`docs/adr/0034-voc-embedding-
similarity-infrastructure.md:71-83`). Without a source VOC ID, neither the
decision unique key nor its audit subject can be truthfully written. The
existing frontend hooks also require `vocId` and call those persisted-pair
routes (`useDismissVocRecommendation.ts:14-29`; `useConfirmVocRecommendation.ts:29-45`).

Accordingly, the panel is informational before submission. The existing saved
VOC recommendation panel remains the only surface for durable dismiss/confirm
and cluster creation/join.

### D4 — Do not add a draft embedding preview in this issue

Candidate A (draft-text embedding preview) has no bounded call count in the
current contract. A debounce bounds bursts, not a draft: it produces one paid
Voyage call for every qualifying idle edit, so a draft can make 1, N, or
unbounded calls. The existing provider accepts arbitrary text batches and sends
them to Voyage (`apps/backend/src/modules/voc/embedding/port.ts:13-20`,
`voyage.ts:57-88`); its stored-VOC hash only prevents re-sending unchanged
persisted content (`embedding/text.ts:1-10,98-116`) and cannot protect an
unsaved draft.

The existing rate-limit convention is actor-scoped, keyed as
`workspace_id:actor_id` for authenticated requests, with IP fallback only for
unauthenticated traffic (`apps/backend/src/server.ts:181-221`). The normal read
tier is 300/min and mutation tier 10/min, both per actor; there is no workspace
aggregate budget (`server.ts:252-292`). A paid preview endpoint could therefore
be abused by a legitimate authenticated actor (or by unauthenticated IPs if
made public) and cannot safely inherit the 300/min read tier. It would need a
new, explicitly approved paid-preview actor quota **and** a workspace aggregate
quota; neither exists now. Candidate B makes zero provider calls and adds no
such abuse surface.

Candidate C (heuristic immediately plus delayed embedding) inherits every
unresolved cost, quota, unavailable-state, and action-semantics question from
candidate A while the prototype only specifies candidate B's output. It is not
recommended for #293.

### D5 — “Join” / “continue as new” is a product decision, not an implied action

The supplied issue requirement says the reporter must join an existing report
or explicitly continue a new one, but the prototype has no such controls (see
§Prototype fidelity). This proposal deliberately supplies neither. If the user
approves a deviation, the follow-up decision must define whether “join” means
navigation without creating a VOC, a duplicate/reference link, or an authorized
cluster operation; they are not equivalent. It must also define what
“continue” records, if anything. Until then the existing VOC submit action
remains unchanged.

**Resolved 2026-08-04 — “join” is navigation only.** The user selected option
(a): activating a candidate navigates to that existing VOC and creates no new
record and no persisted relationship. Consequently:

- There is no new table, column, audit event, idempotency key, or cluster
  side effect in this issue. The panel stays read-only end to end.
- “Continue as a new report” records nothing and needs no control: it is the
  unchanged existing submit action. Not adding a second button is part of the
  decision, not an omission.
- Navigating away from a create form abandons an unsaved draft. The draft is
  already client-only — this ADR does not add draft persistence, and the panel
  must therefore not navigate without the reporter's explicit activation.
- The destination is the existing VOC detail surface with its normal
  authorization. A candidate is only listed when the ADR-0031 predicate already
  admits it, so navigation cannot widen what the actor can read; the detail
  route re-authorizes independently regardless.

## Consequences

- The first #293 implementation can be fully offline and provider-independent.
- The visible result is intentionally a weak related-VOC signal, not a claim of
  semantic similarity. It mirrors the prototype and ADR-0031, while FR-VOC-004
  remains satisfied by the post-save embedding resource.
- Candidate leakage is prevented structurally: apply the ADR-0031 predicate
  before ordering, limit, and any count, as the shipped recommendation query
  already does (`apps/backend/src/modules/voc/recommendations/repo.ts:44-57`).
- The panel has no durable suppression, audit, cluster side effect, or action
  state until a source VOC exists.
- **Conductor judgment:** D1 (candidate B) is faithful to the prototype and
  ADR-0031, but does **not** guarantee that the user-experienced problem
  reported in #293 is solved. Candidate B shows only the latest three VOCs in
  the same Managed System, so if the duplicate target VOC-1000 is not among
  those three, it is invisible to the author. The result can therefore be
  "implemented, but duplicates still occur." Whether to actually ship the
  semantic preview (candidate A) is a cost and quota decision tracked by §Open
  questions, item 3. Adopting this ADR as Proposed means prioritizing candidate
  B for implementation, not that #293 is closed by it.

## Alternatives considered

### A — Draft-text embedding preview — rejected for #293

It would make semantic rankings possible before save, but the current resource
cannot query without a source ID/vector. It also adds unbounded per-draft paid
calls, lacks a paid-preview rate-limit policy, has no source key for dismissal
or confirmation, and would require a distinct honest rendering of provider
failure. The deterministic fake can exercise request handling but cannot prove
semantic quality because it is hash-derived and does not preserve meaning
(`apps/backend/src/modules/voc/embedding/fake.ts:32-53`).

### B — Authorized same-Managed-System heuristic — recommended

It is the exact pre-submit prototype shape, requires no embedding call or new
infrastructure, and can reuse the established authorization seam. It does not
pretend to solve semantic similarity or provide join/continue actions that the
prototype omits.

### C — Immediate heuristic plus delayed embedding — rejected for #293

It preserves B's first paint but still creates A's provider cost and policy
requirements, two competing result semantics, and an unresolved action model.
No local authority justifies that additional surface in this design-only issue.

## Relationship to related ADRs

- ADR-0031 remains the authority for the heuristic, visibility predicate,
  ordering, cap, and its role as the non-embedding related-VOC signal.
- ADR-0034 remains the authority for persisted embedding versions, disabled
  provider behavior, semantic recommendation state, and cluster confirmation.
  This ADR neither supersedes nor weakens D2/D3/D4; it chooses not to invoke
  those persisted-source facilities before a source exists.

## Docs to update on implementation

- `docs/design/04-voc-system.md` — **FR-VOC-004, Implementation status**:
  describe the pre-submit heuristic as distinct from the saved embedding
  recommendation resource; do not claim semantic preview.
- `docs/implementation/03-api-contracts.md` — **VOC endpoints**: document the
  new authenticated, read-only pre-submit peers endpoint and its zero-result/
  authorization behavior.
- `docs/adr/0031-similar-voc-same-managed-system-heuristic.md` — **Decision /
  Consequences**: record the new create-surface consumer, if shipped.
- `docs/design-prototype/screen-voc-create.jsx` and
  `docs/design-prototype/styles.css` — **already done in the ADR-amendment
  commit** (2026-08-04): the candidate item is a `<button type="button">` wired
  to `onNavigate('voc', null, v.id)`, and `.similar-mini` carries the button
  reset needed to keep its rendered appearance identical. `data.js` was not
  changed and must not be — no new displayed field was approved.

## Implementation chunks

1. **BE — pre-submit peer read module and route.** Reuse `actorReadScope` and
   `similarVocVisibilityPredicate`; accept a selected Managed System ID, return
   at most three `{ id, title, created_at }` peers newest-first, and attach the
   existing authenticated read rate-limit tier. Integration tests must seed
   visible, unreadable, archived, other-workspace, and other-system VOCs; assert
   only the three authorized same-system IDs/fields are returned in exact order
   and that zero visible peers returns `[]`, not an embedding-unavailable union.
2. **FE — create-side query and prototype panel.** Enable only after Managed
   System selection; clear/refetch on its change; render the exact heading,
   count, title, and `id · createdAt` presentation in the existing right column.
   Component tests must use a non-empty controlled response to assert all
   displayed strings and a changed Managed System to assert stale candidates
   disappear; a zero response must assert the `0건` state. No mutation hook,
   submit interception, or provider mock belongs in this chunk.
3. **Navigation action — unblocked 2026-08-04, and it folds into chunk 2.**
   The prototype and this ADR were amended first, as required. Because the
   approved contract is navigation-only, there is no authorization, audit, or
   idempotency surface to build and nothing is persisted; the whole action is
   the candidate element being an activatable control that routes to the
   existing VOC detail. It therefore must not be a separate chunk from chunk 2
   — the same component file owns both, and splitting them would put two chunks
   on one file.

   Its oracle is *not* "a button was clicked": assert the router received the
   selected candidate's UUID (not its `display_id`, and not the first
   candidate's id when a later one is activated), and assert that activating a
   candidate issues **no** create request. A test that only asserts a click
   handler fired does not distinguish this contract from the rejected
   create-a-linked-VOC contract.

## Resolved open questions

Answered by the user on 2026-08-04. Nothing here remains open; these answers
are binding on implementation.

1. **Which “join” contract?** → **(a) navigate to the existing VOC, create no
   new record.** No relationship is persisted. See §D5 *Resolved*.
2. **Approve the prototype deviation?** → **Approved, and the prototype was
   amended first** (`screen-voc-create.jsx`, `styles.css`). The deviation is
   narrower than anticipated: the stylesheet already declared the item
   interactive, so only the handler and the element type changed. Copy,
   placement, fields, and count are unchanged from the original prototype. See
   §Prototype fidelity *Amendment*.
3. **Buy the draft embedding preview (candidate A)?** → **No.** It is split out
   of #293 into its own issue and is not funded here. No per-actor or
   per-workspace paid-call budget was set, so the quota design §D4 requires
   does not exist and candidate A must not be started until it does. §D4 stands
   unchanged as the rejection rationale for #293.

Consequence for issue closure: #293 is now unblocked for chunks 1–3, but the
§Consequences *Conductor judgment* warning still holds — candidate B shows only
the latest three peers per Managed System and does not guarantee the reported
duplicate is among them.
