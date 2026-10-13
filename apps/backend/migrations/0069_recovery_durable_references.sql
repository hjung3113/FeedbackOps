ALTER TABLE "survey"."outcome_recovery_history" DROP CONSTRAINT "outcome_recovery_history_actor_id_actors_id_fk";
--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_identities" DROP CONSTRAINT "outcome_recovery_identities_managed_system_id_managed_systems_id_fk";
--> statement-breakpoint
ALTER TABLE "survey"."outcome_recovery_presentations" DROP CONSTRAINT "outcome_recovery_presentations_actor_id_actors_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_history" DROP CONSTRAINT "recovery_history_actor_id_actors_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_identities" DROP CONSTRAINT "recovery_identities_managed_system_id_managed_systems_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard"."recovery_presentations" DROP CONSTRAINT "recovery_presentations_actor_id_actors_id_fk";
