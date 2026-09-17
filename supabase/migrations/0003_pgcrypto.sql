-- ============================================================================
-- BillFolio — Enable the pgcrypto extension
-- ----------------------------------------------------------------------------
-- Fixes: "function gen_salt(unknown) does not exist" when a Super Admin
-- creates a user on the /users page.
--
-- The admin RPCs (`admin_create_user`, `update_user`) hash passwords with
-- `crypt(p_password, gen_salt('bf'))`, which ships with the `pgcrypto`
-- extension. Some databases (or databases created before 0001_init.sql
-- gained its `create extension` line) don't have it enabled yet.
--
-- Idempotent — safe to run any number of times, including alongside
-- `supabase db push` on an existing project.
-- ============================================================================

create extension if not exists pgcrypto;