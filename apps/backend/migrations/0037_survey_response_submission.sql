CREATE UNIQUE INDEX "survey_responses_survey_respondent_actor_uq" ON "survey"."survey_responses" ("survey_id", "respondent_actor_id");
--> statement-breakpoint
GRANT INSERT ON "survey"."survey_responses" TO fops_app;
--> statement-breakpoint
GRANT INSERT ON "survey"."survey_response_answers" TO fops_app;
