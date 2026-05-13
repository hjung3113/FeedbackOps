# Surveys Feature Agent Guide

## Ownership

Surveys owns frontend route composition for Survey creation, builder flows, responses, results, and survey-to-action CTAs.

It does not own VOC creation, Finding persistence, Task mutation, or permission decisions.

## Route Boundary

- Owns `/surveys`, `/surveys/:surveyId`, and `/surveys/:surveyId/results`.
- Survey-derived actions may link into Integration or Tasks through approved API contracts.

## Invariants

- Survey Response must never create VOC.
- Survey Response may create Finding or Evidence Highlight through approved actions.
- Hidden personal responses render through safe summaries only.
- Survey CTAs move from response insight to execution, not duplicate customer voice.
- Surveys are scoped to a Managed System in MVP.

## Rules

- Keep builder and result views simple for MVP.
- Result summaries should expose Create Finding, Link Finding, and Request Task where permitted.
- Permission-limited responses must show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.

## Verification

- Test builder route state, result summary CTAs, forbidden create-VOC affordances, hidden response summaries, and linked action pending/error states when touched.
