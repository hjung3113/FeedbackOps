# Issue #124 — review adjudication & deviations

VERIFY: findings 12/0 PASS; entity-links regression 56/0 PASS; typecheck no new errors.
Two adversarial REVIEW cycles. Resolution:

- **(BLOCKER, FIXED)** evidence_of links were not first-class: `isCreatableTuple` excluded (voc,finding,evidence_of), so link-evidence rows were `hidden` on read + un-detachable. Fix: added the tuple to the gate (create+read+detach) and routed POST /findings/:id/link-evidence through the registry-based entity-links createLink (atomic + audited). Test now asserts the evidence_of link is visible via GET /entity-links for in-scope actors, hidden for Reporter/User, and detachable.
- **(claimed BLOCKER, FALSE POSITIVE)** "0021 migration/snapshot/test untracked." They exist and apply clean (verified: finding.evidence_highlights created, migrate green); the reviewer's `git diff develop` simply does not list untracked files. Staged + committed here.
- **(MAJOR, deferred, consistent with VOC)** analytics_area_id ∈ primary_managed_system_id is enforced in the service layer (review confirmed), not a DB constraint — exactly the VOC precedent (voc.vocs uses a simple AA FK + service check). ADR-0024 §F satisfied. No DB change.
- **(MAJOR, FIXED)** link-evidence used a direct VOC lookup instead of the provider registry — resolved by routing through createLink.
- **(SECURITY) PASS** — GET /findings/:id/evidence-highlights withholds quote_or_summary when the source VOC is unreadable (voc.read OR reporter ownership); no source-preview leak (review-confirmed).
