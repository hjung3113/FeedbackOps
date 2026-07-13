# Surveys Module Agent Guide

Status: not yet implemented — this document is the target contract for this module.

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
