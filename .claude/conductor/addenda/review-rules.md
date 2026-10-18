## FeedbackOps addendum

- Base ref: `origin/develop` (`git diff origin/develop...HEAD`).
- The conductor already ran the frontend vitest suite, the FE typecheck gate, the boundary checker and (for UI) the
  visual harness; results are in `.review/W-<issue>-VERIFY.md`.
- Review policy follows the owner decisions of 2026-10-02 and 2026-10-07. Speed is measured by `nav-perf` and, on a
  regression, judged by `review-perf` (`.review/00-REVIEW-RULES-PERF.md`).
- UI lens (only when the task says no UX review): also check Korean chrome and English domain nouns, and
  `aria-current`.
- Contracts to trace: API, permission, entity-link and audit.
