# VOC Triage panel grouped sections and changed-fields summary

## Status

Accepted 2026-09-28 for issue #520.

## Context

The Triage panel currently follows the seven-section structure in
`docs/design-prototype/screen-voc-create.jsx:416-424`: Overview, Body, Severity,
Owner, Area, Cluster, and Summary. The prototype's Body card and full preview
summary appear at `screen-voc-create.jsx:443-447` and `:548-574`. The production
row also uses independent colors for the reporter status, missing owner, missing
area, and similar-count signals, making ordinary queue metadata compete with
the severity indicator and reporter status.

Triage list items do not include description content. `GET /vocs/:id` already
returns the rich description to readers with full detail access and returns a
permission-limited summary envelope otherwise.

## Decision

1. Group the panel navigation into Overview, Assignment, Similar, and Summary.
   Overview contains the title, reporter status, created date, and description.
   Assignment contains Severity, Owner, and Analytics Area in that order.
   Similar keeps the existing ClusterSectionReadOnly content and
   `similar_count` badge semantics. Summary contains only staged fields that
   differ from the panel's baseline snapshot, followed by the reporter-status
   transition.
2. Render the description from `GET /vocs/:id` with `RichContentRenderer`.
   Empty descriptions show `본문 없음`; loading shows a muted loading line;
   a summary envelope shows an explicit unavailable state; and query errors
   show a separate load-failure state. The VOC title is never used as body text.
3. In triage rows, semantic color is reserved for the severity indicator and
   reporter-status badge. Missing Owner, missing Area, and similar-count text
   use the existing muted text token.
4. Keep the four URL-backed toolbar tabs locked by ADR-0022. Render the sort
   hint as muted secondary text with the full sort rule in a hover `title` tooltip.

## Consequences

- The production panel intentionally deviates from the prototype's seven
  sections and full Summary preview. The approved grouped layout removes the
  separate Body section and Cluster placeholder row while preserving the
  pickers, recommendation content, and reporter-status transition.
- The description is fetched through the existing detail endpoint; no backend
  or shared-schema change is required. Permission-limited readers get explicit
  unavailable copy instead of title text or a blank body.
- Other consumers of `DetailPanelSectionNav` are unchanged.
- The triage toolbar retains the four-tab behavior documented by ADR-0022.

## Related

- ADR-0022 (VOC Triage tab toolbar deviation)
- Prototype sections: `docs/design-prototype/screen-voc-create.jsx:416-424`
- Prototype full Summary preview: `docs/design-prototype/screen-voc-create.jsx:548-574`
- Issue #520
