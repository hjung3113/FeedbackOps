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
