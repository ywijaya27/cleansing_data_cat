-- =============================================================================
-- AI Material Master Cleansing & Rationalization System
-- Skrip Setup Manajemen User & Hak Akses (Role-Based Access Control / RBAC)
-- =============================================================================

-- 1. TABEL: app_role_permissions (Konfigurasi Hak Akses Menu & Aksi per Peran)
CREATE TABLE IF NOT EXISTS public.app_role_permissions (
    role TEXT PRIMARY KEY,
    role_name TEXT NOT NULL,
    allowed_menus JSONB NOT NULL,
    can_upload BOOLEAN DEFAULT false,
    can_run_ai BOOLEAN DEFAULT false,
    can_merge BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABEL: app_users (Daftar Pengguna Aplikasi)
CREATE TABLE IF NOT EXISTS public.app_users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'OPERATOR' REFERENCES public.app_role_permissions(role) ON UPDATE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_users_username ON public.app_users (username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.app_users (role);

-- 3. SEED DEFAULT PERMISSIONS
-- Guest / Pengunjung (Bisa akses tanpa login)
INSERT INTO public.app_role_permissions (role, role_name, allowed_menus, can_upload, can_run_ai, can_merge, can_manage_settings)
VALUES 
    ('GUEST', 'Pengunjung (Tanpa Login)', '["dashboard", "materials", "similarity"]'::jsonb, false, false, false, false),
    ('OPERATOR', 'Operator Cleansing Data', '["dashboard", "upload", "materials", "duplicates", "similarity"]'::jsonb, true, true, false, false),
    ('ADMIN', 'Administrator Sistem', '["dashboard", "upload", "materials", "duplicates", "similarity", "users", "settings"]'::jsonb, true, true, true, true)
ON CONFLICT (role) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    allowed_menus = EXCLUDED.allowed_menus,
    can_upload = EXCLUDED.can_upload,
    can_run_ai = EXCLUDED.can_run_ai,
    can_merge = EXCLUDED.can_merge,
    can_manage_settings = EXCLUDED.can_manage_settings,
    updated_at = NOW();

-- 4. SEED DEFAULT USERS (Admin & Operator)
-- SHA-256 dari 'admin123' adalah '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
-- SHA-256 dari 'operator123' adalah 'ec6e1c25258002eb1c67d15c7f45da7945fa4c58778fd7d88faa5e53e3b4698d'
INSERT INTO public.app_users (username, full_name, password_hash, role, is_active)
VALUES
    ('admin', 'Administrator Sistem', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'ADMIN', true),
    ('operator', 'Operator Cleansing Data', 'ec6e1c25258002eb1c67d15c7f45da7945fa4c58778fd7d88faa5e53e3b4698d', 'OPERATOR', true)
ON CONFLICT (username) DO NOTHING;

-- 5. RLS & HAK AKSES
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_role_permissions" ON public.app_role_permissions;
CREATE POLICY "service_role_all_role_permissions" ON public.app_role_permissions TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_role_permissions" ON public.app_role_permissions;
CREATE POLICY "anon_select_role_permissions" ON public.app_role_permissions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_role_all_app_users" ON public.app_users;
CREATE POLICY "service_role_all_app_users" ON public.app_users TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.app_role_permissions TO anon, authenticated, service_role;
GRANT ALL ON public.app_users TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.app_users_id_seq TO anon, authenticated, service_role;
