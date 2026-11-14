-- Run once after SETUP_USER_MANAGEMENT.sql; safe to run again.
-- Existing menus and permissions are preserved.
BEGIN;
ALTER TABLE public.app_role_permissions
  ADD COLUMN IF NOT EXISTS can_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_run_consistency BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_consistency BOOLEAN NOT NULL DEFAULT false;
COMMIT;
-- ADMIN has fixed full access in the policy. Enable the consistency menu and
-- audit/export actions for OPERATOR from User & Hak Akses after deployment.
