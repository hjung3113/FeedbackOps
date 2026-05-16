CREATE TABLE "core"."rate_limits" (
	"key" text NOT NULL,
	"route_group" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_key_route_group_pk" PRIMARY KEY("key","route_group")
);
--> statement-breakpoint
CREATE INDEX "rate_limits_expires_at_idx" ON "core"."rate_limits" USING btree ("expires_at");--> statement-breakpoint
-- ADR-0008 role grants. Hand-added (ADR-0015:48 step 3): drizzle-kit does not
-- generate GRANT statements. fops_app needs full DML on rate_limits because
-- the @fastify/rate-limit custom store upserts on every request. fops_migrate
-- already has ALL on every table via the schema-level grant in migration 0000.
GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."rate_limits" TO fops_app;
