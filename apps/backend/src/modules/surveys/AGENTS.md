# Surveys Module Agent Guide

## Ownership

Survey owns Survey, Survey Response, Survey Result, survey-specific summaries, and survey evidence read models.

## Invariants

- Survey Response must never create VOC through UI or API.
- Survey evidence may create Finding, Task Request, Task, or Milestone through approved commands.
- Hidden personal responses must render through safe summaries only.
- Survey CTAs should move from response insight to execution, not to duplicate customer voice.

## Cross-System Rules

- Use `entity_links` for Finding or execution links.
- Preserve evidence source identity in all derived work.

## Verification

- Test forbidden create-VOC paths, hidden response summaries, and survey-to-Finding evidence preservation when touched.

## Close-out contract (ADR-0067; implementation pending)

- ADR-0067 preserves the dedicated Survey operator resolver and ADR-0055 response classifier,
  source-owned decisions/reopen and personal-read audits (no Admin bypass).
- Proposed/new response presentation/history adapter stays Survey-owned/personal-gated;
  Dashboard gets aggregate count/safe Survey navigation, no non-holder response enumeration.
- Response-derived Finding responsibility is resolved by Findings after the personal source gate.

## Provenance and safe reuse (ADR-0064; #1109 backend/shared implemented)

Backend/shared implementation is present; migration application and real-role
integration verification remain conductor-owned. The frontend picker is separate.

- Survey owns proposed/new protected Finding/highlight response/approval/text
  extensions and authorized batch read/write seams; Finding owns parent lifecycle
  and counters. No direct app SELECT/general DML on the extensions.
- Safe highlight reads check source access and exact active approval in the same
  transaction snapshot with target Finding read. Preserve their existing audience
  separately from result-picker cohort/per-question suppression; omit denied/revoked quote.
- The #1109 candidates allow result readers to reuse suppression-visible
  approved excerpts without a personal grant. The Finding command requires target
  `finding.manage`, rechecks source/result audience and approval on submit, and
  resolves response UUIDs internally. Existing response-addressed creation keeps
  explicit personal access and no Admin bypass.
- Results derived-Finding lookup uses a proposed/new workspace+Survey-ID reader,
  returning candidate Finding IDs/target scope, not a raw response-ID link join.
  Source and target Managed Systems may differ under independent authorization
  inside one workspace. No personal grant merely for safe derived discovery.
- Generic summaries are metadata-only; preserve private UUIDs/history. Trusted
  app authorization does not promise SQL unlinkability for stolen app credentials.
