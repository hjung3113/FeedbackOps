# ADR-0053: Survey result response-state disclosure

Date: 2026-09-28

## Status

Accepted.

## Context

The safe result summary suppresses every question for a non-holder when the response cohort is below the configured anonymity threshold. Without a survey-level state, a survey with no responses is indistinguishable from one with a small nonzero cohort.

## Decision

`GET /surveys/:id/results` returns a required `response_state` and the resolved positive-integer `anonymity_threshold`.

- A total response count of zero returns `response_state: "none"` for every actor. Disclosing that no response exists cannot identify or reveal an individual response.
- A non-holder with one through `anonymity_threshold - 1` responses receives `response_state: "below_threshold"`; every question keeps the existing suppressed shape, and no numeric response count is exposed.
- A holder of `survey.read_personal_responses` receives `response_state: "visible"` for a nonzero cohort below the threshold and keeps the existing per-question payload. At zero responses, the state remains `"none"`, with the holder's existing visible questions and zero answer counts.
- A cohort at or above the threshold returns `response_state: "visible"` for every actor. Question-level low-bucket suppression remains unchanged.

Admin role alone does not grant the personal-response capability. The state field does not change any per-question result shape or the existing permission boundary.

## Consequences

The result page can distinguish no responses from a protected small cohort without exposing an exact below-threshold count. Consumers must use `response_state` for the survey-level message and keep question rendering governed by each question's existing visibility.

## Relationship to ADR-0033

This decision amends the survey-level result projection while preserving ADR-0033's anonymity threshold, suppression, and safe-summary rules.
