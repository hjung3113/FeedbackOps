# Surveys Feature Agent Guide

## Ownership

Surveys owns frontend route composition for Survey creation, builder flows, responses, results, and survey-to-action CTAs.

It does not own VOC creation, Finding persistence, Task mutation, or permission decisions.

## Route Boundary

- Owns `/surveys`, `/surveys/:surveyId`, `/surveys/:surveyId/results`, `/surveys/:surveyId/follow-up`, `/surveys/participate`, and `/surveys/:surveyId/respond`.
- Survey-derived actions may link into Integration or Tasks through approved API contracts.

## Invariants

- Survey Response must never create VOC.
- Survey Response may create Finding or Evidence Highlight through approved actions.
- Hidden personal responses render through safe summaries only.
- Survey CTAs move from response insight to execution, not duplicate customer voice.
- Surveys are scoped to a Managed System in MVP.

## Rules

- Keep builder and result views simple for MVP.
- Result summaries should expose Create Finding and Request Task where permitted; Link Finding is deferred out of MVP scope (ADR-0037).
- Selected-Finding load/ready/error orchestration stays in Survey; source reads and the Finding-owned Request Task draft host come through `features/findings/public.ts`.
- Permission-limited responses must show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.

## Key files

- `apps/frontend/src/routes/_authed/surveys/index.tsx` — Survey list and selected-detail composition.
- `apps/frontend/src/routes/_authed/surveys/$surveyId.tsx` — Survey builder and detail route.
- `apps/frontend/src/routes/_authed/surveys/$surveyId.results.tsx` — Survey results route.
- `apps/frontend/src/routes/_authed/surveys/$surveyId.follow-up.tsx` — Survey follow-up route.
- `apps/frontend/src/routes/_authed/surveys/participate.tsx` — answerable Surveys and response history.
- `apps/frontend/src/routes/_authed/surveys/$surveyId_.respond.tsx` — respondent form deep link.
- `apps/frontend/src/features/surveys/routes/SurveyParticipationPage.tsx` — participation list and respondent form states.
- `apps/frontend/src/features/surveys/components/respond/` — shared preview and respondent question rendering/branching.
- `apps/frontend/src/features/surveys/components/list/SurveyList.tsx` — Survey list rows and list states.
- `apps/frontend/src/features/surveys/components/detail/SurveyDetail.tsx` — Survey detail fields and actions.
- `apps/frontend/src/features/surveys/components/builder/SurveyBuilder.tsx` — Survey builder composition.
- `apps/frontend/src/features/surveys/components/SurveyStatusBadge.tsx` — Survey status labels and badge styles.
- `apps/frontend/src/features/surveys/components/results/SurveyResultsSummary.tsx` — result summary and follow-up actions.
- `apps/frontend/src/features/findings/public.ts` — supported Finding source-read and Request Task host edge used by Survey results.
- `apps/frontend/src/features/surveys/components/results/CreateFindingDraftPanel.tsx` — Finding draft from response excerpts.
- `apps/frontend/src/features/surveys/routes/SurveyFollowUpRoute.tsx` — follow-up decisions view.
- `apps/frontend/src/features/surveys/hooks/useSurveys.ts` — Survey, result, and mutation queries.

## Verification

- Test builder route state, result summary CTAs, forbidden create-VOC affordances, hidden response summaries, and linked action pending/error states when touched.
