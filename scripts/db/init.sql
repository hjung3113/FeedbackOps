-- Postgres bootstrap for local dev / CI.
-- Provisions the two runtime roles per ADR-0008 plus the NOLOGIN owner for
-- the aggregate-only survey result read interface:
--   * fops_migrate — owns the schema, runs migrations, has ALL privileges.
--   * fops_app     — runtime app role. Migrations grant INSERT+SELECT only on
--                    core.audit_log, plus INSERT+SELECT+UPDATE+DELETE on every
--                    other Slice 1 table.
--   * fops_survey_aggregate_owner — owns only SECURITY DEFINER aggregate
--                    functions and their minimum raw-column reads.
--
-- This file runs once when the Postgres container initialises an empty
-- data directory. Migration SQL (apps/backend/migrations/*.sql) does the
-- per-table GRANT/REVOKE work; this file only creates the roles, the
-- database, and ensures `fops_migrate` owns it.
--
-- The superuser bootstrap user comes from POSTGRES_USER/POSTGRES_PASSWORD on
-- the container; the Drizzle CLI and the app both connect as the two roles
-- below, never as the superuser.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_migrate') THEN
    CREATE ROLE fops_migrate WITH LOGIN NOINHERIT PASSWORD 'fops_migrate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_app') THEN
    CREATE ROLE fops_app WITH LOGIN NOINHERIT PASSWORD 'fops_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fops_survey_aggregate_owner') THEN
    CREATE ROLE fops_survey_aggregate_owner WITH NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Migrations create the functions as fops_migrate, then transfer ownership to
-- this NOLOGIN role and SET ROLE to set their ACLs. Membership is intentionally
-- one-way: the aggregate owner never inherits fops_migrate's broad privileges.
GRANT fops_survey_aggregate_owner TO fops_migrate;

-- CREATE DATABASE cannot run inside a DO block; the dollar-quoted shell entry
-- script handles re-entrancy by checking existence before running this file.
CREATE DATABASE feedbackops OWNER fops_migrate;

\connect feedbackops

-- Make sure the migrate role is able to create the schemas the migrations
-- reference. App role gets connect-only at the database level; per-table
-- GRANTs are added by migration SQL.
GRANT CONNECT ON DATABASE feedbackops TO fops_app;
GRANT CONNECT ON DATABASE feedbackops TO fops_migrate;
