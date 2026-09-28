# ADR-0055: Outcome Survey follow-up decisions

Date: 2026-09-28

## Status

Accepted.

Closes the decision record required by issue #510 sub-issue 1 and governs its
storage, commands, and gap predicate (sub-issue 2). The research input is
`docs/superpowers/specs/2026-09-26-outcome-survey-followup-design.md`.

## Context

`type: 'outcome'` surveys shipped without the behavior that gives the type its
purpose: classifying a poor result, recording an explicit no-follow-up
decision, and driving the dashboard gap from that state. The only shipped
classifier was `survey.count_negative_outcome_without_followup` (migration
0046), whose predicate answered none of the product questions: it counted
`answer_value <= rating_min` on open as well as closed surveys, ignored the
anonymity threshold, and treated any active link to a Finding or Task —
including `evidence_of` — as follow-up present, without checking the linked
Finding's current status.

The design docs (`07-survey-system.md`, `08-dashboard-system.md`,
`api/next-actions.md`) deliberately left "poor", "configured", grain, gating,
resolution, and storage open. Issue #510 locked the answers; this ADR records
them.

## Decision

1. **Poor result** — an `outcome` survey response with at least one `rating`
   answer in the **low band** of the shared partition helper
   `getRatingBandForValue(rating_min, rating_max, value)`
   (`packages/shared/src/surveys/results.ts`): each band gets `floor(n / 3)`
   values, remainder to low then mid. Choice questions never contribute. The
   SQL classifier reproduces that exact partition through the IMMUTABLE helper
   `survey.rating_band_for_value`, and an integration parity test pins the two
   partitions together over every legal `(min, max, value)` combination. This
   supersedes 0046's `answer_value <= rating_min` floor rule (on 1–5 the low
   band is 1–2, not only 1) and the prototype's aggregate
   `overallScore < 7` rule, which was never a shipped classifier.
2. **Configured** — every `type = 'outcome'` survey is configured for
   follow-up. No per-survey opt-in flag, no workspace workflow template for v1
   (`FOP-OUT-011`).
3. **Grain** — per response, matching `create-finding` and the count's
   existing `count(DISTINCT response)` shape.
4. **Survey status gating** — only `closed` surveys are classified. Open and
   draft surveys are never poor and never counted; more responses can still
   arrive while a survey is open.
5. **Anonymity threshold** — a survey whose total response count is below the
   workspace `survey_anonymity_threshold` (`core.workspace_settings`, ADR-0033
   addendum, default 5) is excluded from classification entirely: not counted,
   not poor. This applies inside the privileged classifier, not only at the
   read surface, so the dashboard count cannot become a subtraction oracle.
6. **What clears a gap** — exactly one of:
   (a) an active `survey_response → finding` `generated_finding` link whose
   Finding's **current** status is `draft`, `active`, or `converted`;
   `not_actionable` or `archived` reopen the gap; or
   (b) a current `no_follow_up` decision on the state row.
   This is a deliberate behavior change from 0046 in two narrows: `evidence_of`
   links no longer clear the gap (attaching evidence is context enrichment,
   per `08-dashboard-system.md`), and link existence alone no longer clears it
   when the linked Finding's current status is `not_actionable` or `archived`.
   The issue's "rejected" Finding state maps to the existing `not_actionable`
   status; there is no merged Finding state in the model, so none is handled.
   `target_type = 'task'` is dropped from the predicate: the link registry has
   no `survey_response → task` pair and follow-up must go through a Finding.
7. **Follow-up goes through a Finding** — there is no direct
   Survey Response → Task Request path. The built chain stays
   Response → Finding (`create-finding`) → Task Request (`/findings/:id/request-task`).
8. **Storage** — option (b): one current state row per response in
   `survey.outcome_follow_up_decisions` (`no_follow_up` | `reopened`,
   non-empty reason, deciding actor, survey's primary Managed System at
   decision time), plus decision history in `core.audit_log` (ADR-0008).
   The stored `managed_system_id` is the survey's primary Managed System at
   the **first** decision: a later re-mark does not refresh it, while each
   command's audit detail records the Managed System current at that
   transition. `fops_app` gets `SELECT`, `INSERT`, and `UPDATE` scoped to the
   transitioning columns (`state`, `reason`, `decided_by_actor_id`,
   `updated_at`), and no `DELETE` — the `voc.voc_recommendation_decisions`
   precedent. Reopen updates the row in place; it does not delete or supersede
   by insertion.
9. **Command authorization** — both commands require, in create-finding's
   order: the Survey personal-response gate
   (`survey.read` then explicit `survey.read_personal_responses` with no Admin
   bypass; missing, foreign, denied-read, and denied-personal all collapse to
   the same `404 not_found.record`), then `finding.manage` on the survey's
   primary Managed System (`403 permission.denied`, Admin role bypass intact).

## Privilege boundary

`fops_app` still cannot read `survey.survey_responses` or
`survey.survey_response_answers`. Classification therefore runs inside
`SECURITY DEFINER` functions owned by `fops_survey_aggregate_owner`
(`SET search_path = pg_catalog`, PUBLIC revoked, `EXECUTE` granted to
`fops_app`):

- `survey.read_outcome_follow_up_state(workspace, response)` returns only
  `survey_id`, survey status, `is_outcome`, `meets_threshold`, `is_poor`, and
  `resolution` (`open` | `finding` | `no_follow_up`). No answer values, no
  text, no respondent id. It is called only behind the personal-response
  authorization seam.
- `survey.count_negative_outcome_without_followup` keeps its aggregate-only
  contract and signature; its body now implements decisions 1–6. The owner's
  column grants are extended narrowly for this: `surveys.status`,
  `survey_questions.rating_max`, `entity_links.relation_type`/`target_id`,
  `finding.findings(id, workspace_id, status)` plus `USAGE` on schema
  `finding`, `core.workspace_settings(workspace_id,
  survey_anonymity_threshold)`, and column-scoped `SELECT` on the new table.

## Structured failures

Both commands reject with `409 conflict.stale_write` carrying
`detail.failure_code` (no new error codes), with separate preconditions.
**Mark** requires the subject to be classifiable as poor with an `open`
resolution: `action_no_longer_available` when it is not classifiable as poor
(non-outcome, not closed, below threshold, or no low-band answer), and
`recovery_item_resolved` when a Finding resolution or a current `no_follow_up`
decision is already in force. **Reopen** requires only that the current
decision row is `no_follow_up`; it does not re-run the classifier, and any
other row state (or no row) rejects with `action_no_longer_available`. After
a reopen the response re-enters the `bad-outcome-no-followup` queue only if it
is still poor and above the threshold and no qualifying Finding link exists.
This is the `api/next-actions.md` structured action-failure payload applied to
these two commands.

## Commands and audit

`POST /survey-responses/:id/mark-no-follow-up` and
`POST /survey-responses/:id/reopen-follow-up` (strict `{ reason }`, non-empty
after trim, max 2000; required `Idempotency-Key` UUIDv4; mutation rate tier;
`runIdempotent` with state checks inside the miss path). The commands' audit
events record only successful transitions; a rejected command writes neither a
state row nor an audit row. Audit events
`survey_outcome_no_follow_up_marked` and `survey_outcome_follow_up_reopened`
use the survey response as subject; detail is strict
`{ survey_id, managed_system_id, reason }` and reopen adds `previous_reason`.

## Consequences

- The dashboard `bad-outcome-no-followup` queue count now tells the truth the
  design asked for: closed, threshold-clearing outcome surveys with low-band
  responses and neither a live Finding nor a standing no-follow-up decision.
- Marked responses drop out of the active queue and re-enter on reopen or when
  the linked Finding becomes `not_actionable` or `archived`; the audit trail,
  not the queue, remains the decision history.
- Parts C/D of #510 remain open: the review read endpoint
  (`GET /surveys/:id/outcome-follow-up`) with permission-gated
  `next_actions`/`recommended_action_id`, and the Survey-owned review UI. The
  per-response `subject_id`/poor-flag disclosure rules of the research
  (personal-grain only behind `survey.read_personal_responses`) bind those
  parts; this ADR does not add any read surface.

## Reopening triggers

A direct Survey Response → Task Request path, a per-survey follow-up opt-in,
threshold customization below the ADR-0033 floor, or a Finding merge state
each reopens the relevant decision here.
