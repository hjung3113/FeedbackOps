# FeedbackOps

## Register

product

## Users

FeedbackOps is an internal, AD-authenticated operating console for one Workspace — not a public-facing tool, not a marketing site, not a multi-tenant SaaS. Every screen serves an authenticated internal **Actor** working inside a known **Managed System** scope.

Per `CONTEXT.md`, four real role contracts exist:

- **Admin** — Workspace-wide authority. Manages settings, permissions, Managed System Registry, Analytics Areas, operating policy, and approves Permission Requests. Lives mostly in `/admin/*` routes.
- **Developer** — Mid-level Actor with one or more **Managed System Permission Scopes**. Triages VOC, investigates evidence, owns Findings, executes Task work, and closes the loop with Reporter Reply / Public Update. Lives in `/vocs?view=triage`, `/tasks/*`, `/integration/*` (Findings, Evidence, Coverage, Links).
- **User** — Lowest Role Level. Submits VOC, tracks own submissions in `/vocs?view=my`, responds to outcome surveys. Cannot triage, cannot see out-of-scope VOC bodies (only `out_of_scope_summary` peeks).
- **Reporter** — Role-shaped, not Role-Level-shaped. The Actor who submitted a specific VOC. The system separates reporter-facing status from internal workflow status visually and structurally (Product Invariant).

Context of use is operational, not exploratory: the Actor opens FeedbackOps because a VOC arrived, a triage queue grew, a Finding needs evidence, a Task is blocked, or a survey closed. Sessions are short, dense, decision-driven. The product is "the inbox you live in when feedback is the work," not "a place you browse."

## Product Purpose

FeedbackOps closes the loop from internal voice-of-customer intake to documented outcome inside one Workspace. The cycle, per `CONTEXT.md` and `docs/design/00-product-overview.md`:

1. **Intake** — any Actor submits a VOC against a Managed System (`/vocs?action=create`).
2. **Triage** — Developers / Admins decide severity, owner, Analytics Area linkage, and cluster confirmation in the Triage Console (`/vocs?view=triage`), with optimistic mutations and a 4-second undo window.
3. **Evidence → Finding** — VOC items, survey responses, and operator notes are linked through `entity_links` (the canonical cross-system history) into Findings — the bridge from evidence to execution.
4. **Execution** — A Finding may produce a **Task Request**, which protects the Task backlog from unreviewed execution candidates; approved requests become Tasks with their own state machine, independent from reporter-facing VOC status.
5. **Outcome** — Outcome surveys close the loop and feed back into the same `entity_links` graph; the Dashboard surfaces this as an action queue, not a reporting chart.

The product solves the problem that, without it, feedback intake, triage decisions, evidence collection, execution tracking, and outcome validation each live in separate tools — and the trail between "what we heard" and "what we did about it" is reconstructed by hand. FeedbackOps makes the trail first-class via `entity_links`, makes the triage decision auditable, and makes the cross-system history canonical instead of incidental.

Slice 3 (currently shipped) covers VOC Inbox + My + Detail panel + Create form. Future slices cover Cluster, Finding create flow, Task Request, Entity Links UI, and Survey result loops. The scope of this document is the whole product, not the current slice.

## Brand Personality

**Personality in three words: precise, audit-trail-faithful, restrained.**

FeedbackOps is the calm enterprise console for the moment after a complaint lands. It speaks like an experienced internal operator who has read the whole thread: terse, factual, never performative. The interface earns trust by receipt — every state change is visible, every cross-system link is traceable through `entity_links`, every reporter-facing message is distinct from every internal note. Confidence comes from showing the audit trail, not from decorative polish.

**Voice rules (binding):**

- **Copy follows the prototype/spec/reference verbatim. Korean and English coexist; surface convention matters more than language consistency.** Per root `AGENTS.md` → Prototype Is The Spec: mirror whatever the prototype or reference design shows for a given surface — Korean strings (e.g. '접수됨', '심각도', '큐가 비었습니다'), English strings (e.g. `Reporter`, `Owner`, `Triage`, `Managed System`, `Workspace Admin`, `BODY`), or mixed lines are all acceptable when the reference dictates them. Do not reflexively translate either direction; do not enforce a single-language rule across surfaces.
- **Prototype copy is verbatim.** `docs/design-prototype/screen-*.jsx` + `data.js` are the single source of truth for labels, headers, button text, and microcopy. No paraphrase, no "improvement," no marketing softening.
- **One primary action per toolbar or panel.** Secondary actions live in subtle buttons, menus, or contextual rows (per `apps/frontend/AGENTS.md`).
- **No marketing fluff.** No exclamation points in operational copy. No emoji in product surfaces. No em dashes inside UI strings (em dashes are allowed in docs like this one, not in shipped UI).
- **Reporter-facing vs internal copy are physically separate surfaces.** Public Update, Reporter Reply, and Internal Comment are three distinct composers; their visual treatment must never collapse together.
- **Permission-limited content speaks the request path, not the blank failure.** A blocked panel shows an approved summary or a "request access" CTA, never a stack trace and never silence.

## Anti-references

What FeedbackOps deliberately is NOT, drawn from the locked decisions in `docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md` and `docs/adr/0021-pack-17-samsung-light-design-system.md`:

- **Bright SaaS gradient marketing aesthetics** — Stripe-homepage-style hero gradients, animated mesh backgrounds, "sign up free" CTAs. FeedbackOps has no public surface; design serves the product, design is not the product.
- **Crypto / fintech "navy + gold" patterns** — luxury-trading-desk treatments, dark navy with metallic accents, "premium" framing. The accent is Samsung blue `#1428a0`, used selectively on primary CTAs only; gold/amber/lime do not exist in this palette.
- **Glassmorphism dashboards** — frosted-blur cards floating over photographic backgrounds. ADR-0021 locks flat layered surfaces (`#f3f7fe` canvas, `#fbfdff` graphite card, `#edf3fb` deep slate elevated card) with sharp contained shadows, not blur.
- **Hero-metric template** — the "big 96px number + tiny gray label + soft gradient" homepage card. The Dashboard is an **action queue surface, not a chart-only reporting page** (Product Invariant). Charts may exist; they never lead.
- **Dark-mode-by-default tools** — Linear / Vercel / Raycast dark defaults. ADR-0021 supersedes ADR-0016 and chose light explicitly for the Samsung corporate environment. A future ADR may reintroduce a `[data-theme="dark"]` override; until then, light is canonical and dark is out of scope.
- **Identical-card-grids** — Notion-template-gallery / Pinterest-style equal-weight cards. FeedbackOps is dense, list-first, and operational; equal-weight grids hide priority and bury the decision the Actor came to make.
- **Decorative imagery, illustrations, oversized whitespace** — per DESIGN.md "Do's and Don'ts," the design is compact, leveraging an 8px element gap as a standard measurement. Empty states are terse Korean strings + one CTA, not full-bleed illustrated empty states.

**NOT to be used as an anti-reference:** the prototype in `docs/design-prototype/` itself. The prototype IS the source of truth for layout, hierarchy, density, spacing, and copy. Deviating from it requires an explicit ADR or a user-recorded OK in the PR body.

## Design Principles

Five strategic principles derived from `AGENTS.md`, `apps/frontend/AGENTS.md`, ADR-0020, ADR-0021, and `.review/PROTOTYPE-TO-PACK17.md`:

1. **Pack 17 light tokens only — no raw hex, no raw px outside the scale.** Per ADR-0021, the canonical palette is Samsung-light (`#f3f7fe` canvas, `#1428a0` accent, `#101828` text). Implementations consume semantic tokens (`--text-primary`, `--surface-detail`, `--border-selected`); raw hex in feature screens is a review block. Spacing uses the fixed scale (4 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 36 / 40 / 48 / 64). Radii are 6px for cards/buttons/inputs, 2px for tags, 4px for badges. New tokens land in DESIGN.md and `packages/ui/src/styles/tokens.css` before broad use.

2. **Three-shell topology — `PageShell`, `ListShell`, `WorkbenchShell`, and nothing else.** ADR-0020 locks the route-layout vocabulary. Every screen classifies into one of the three. Backlog, Survey builder/result, and Roadmap are explicit *extensions* of those three, not new shells. All five header surfaces (sidebar system header, ListShell toolbar, WorkbenchShell toolbar, drawer panel header, Survey preview drawer header) share a single 50px baseline. Adding a fourth shell requires an ADR amendment.

3. **Prototype is the spec — mirror within 1px, do not invent.** `docs/design-prototype/screen-*.jsx` + `data.js` + `screenshots/final-baselines/*.png` define every user-facing surface. First action of any frontend chunk: open the prototype, open the baseline PNG, write a five-line matching plan into the PR description. If the prototype is silent on a behavior, stop and ask — do not fill the gap with framework defaults or personal taste. `.review/PROTOTYPE-TO-PACK17.md` (637 lines) is the canonical class→component translation reference.

4. **Pixel-diff baselines per page; ≥99% prototype match target.** Every page-level frontend issue runs a structured Playwright pixel-diff against `docs/design-prototype/screenshots/final-baselines/<page>.png` at desktop 1440 before PR merge. The report enumerates every visible difference in a Region / Category / Prototype / Impl / Severity / Resolution table. Any HIGH severity or any copy-category mismatch blocks merge. The merged PR carries the post-fix diff report, not the initial one. Component-only issues are exempt; pages without a baseline queue a prototype refresh issue rather than silently shipping.

5. **Trust by receipt — separate state machines, canonical cross-system links, no synthetic convenience columns.** Reporter-facing VOC status and internal Task status are separate state machines (Product Invariant). Cross-system history is canonical through `entity_links`, never through duplicated convenience columns. VOC is AD-authenticated internal voice and is never auto-created from Survey Response. Permission-limited content shows an approved summary or a request path, not a blank failure. Every visible state change in the UI maps to an auditable backend transition; the audit trail is the trust mechanism.

## Accessibility & Inclusion

- **WCAG 2.2 AA target inherited from ADR-0016 and re-validated under ADR-0021.** Dark-theme contrast guarantees do NOT transfer to the inverted light palette; every component contrast pair must be re-verified. Slice 3 final review includes an axe-core scan against touched routes.
- **Primary locale is Korean (`<html lang="ko">`) per ADR-0010** (single-locale-with-catalog), with English preserved verbatim for domain / role / system terms. No machine translation of either side.
- **Icon-only controls require accessible labels.** `lucide-react` is the icon set; every icon-only button carries an `aria-label` or visible adjacent text.
- **Keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states are visually distinct** (per `apps/frontend/AGENTS.md`). Focus ring uses `--color-neon-lime` (now Samsung-blue `#1428a0`, name preserved for token continuity per ADR-0021).
- **Permission-limited surfaces are first-class.** `<PermissionBlockedPanel>` renders `blocked_not_requestable`, `summary_visible`, and `denied` states — never a blank failure, never a stack trace.
- **Desktop-only scope in current slices.** Mobile / tablet shell behavior, RTL direction, and multi-pane shells are explicitly out of scope per ADR-0020; future ADRs will codify them. Pack 13 responsive scaffolding (sidebar drawer < 900px, detail-panel drill-in overlays) remains the floor.
