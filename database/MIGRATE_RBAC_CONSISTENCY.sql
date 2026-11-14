-- Run once after SETUP_USER_MANAGEMENT.sql; safe to run again.
-- Existing menus and permissions are preserved & enhanced for Consistency & Reports.
BEGIN;
ALTER TABLE public.app_role_permissions
  ADD COLUMN IF NOT EXISTS can_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_run_consistency BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_consistency BOOLEAN NOT NULL DEFAULT false;

-- Update OPERATOR: aktifkan menu consistency & reports, serta izin audit & review
UPDATE public.app_role_permissions
SET 
  allowed_menus = '["dashboard", "upload", "materials", "duplicates", "similarity", "consistency", "reports"]'::jsonb,
  can_run_consistency = true,
  can_export_consistency = true,
  can_review = true,
  updated_at = NOW()
WHERE role = 'OPERATOR';

-- Update ADMIN: pastikan semua menu termasuk consistency & reports terdaftar
UPDATE public.app_role_permissions
SET 
  allowed_menus = '["dashboard", "upload", "materials", "duplicates", "similarity", "consistency", "reports", "users", "settings"]'::jsonb,
  can_run_consistency = true,
  can_export_consistency = true,
  can_review = true,
  updated_at = NOW()
WHERE role = 'ADMIN';

COMMIT;
