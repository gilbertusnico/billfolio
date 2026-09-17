-- ============================================================================
-- BillFolio — Fix admin RPCs so pgcrypto's gen_salt() is resolvable at runtime
-- ----------------------------------------------------------------------------
-- WHY: `admin_create_user` and `update_user` hash passwords with
--   `crypt(p_password, gen_salt('bf'))`. On Supabase the `pgcrypto` extension
--   lives in the `extensions` schema, but these functions were created with
--   `security definer` and `set search_path = public`, so at call time
--   Postgres only searches `public` + `pg_catalog` — it never looks in
--   `extensions` and the call fails with
--   "function gen_salt(unknown) does not exist", EVEN when the extension is
--   enabled. (0003_pgcrypto.sql only created the extension, which never fixed
--   the search_path problem — this migration does.)
--
-- IDEMPOTENT — safe to run any number of times, and alongside a past
-- `supabase db push` on an existing project (alter function is a no-op-ish
-- re-set of the same value on re-run).
-- ============================================================================

create extension if not exists pgcrypto;

-- The two RPCs that call crypt()/gen_salt() — MUST see the extensions schema.
alter function public.admin_create_user(text, text) set search_path = public, extensions;
alter function public.update_user(uuid, text, text, text) set search_path = public, extensions;

-- Consistency: the other security-definer helpers don't use pgcrypto, but
-- pinning the same search_path keeps behavior uniform across the schema.
alter function public.is_super_admin() set search_path = public, extensions;
alter function public.is_company_member(uuid) set search_path = public, extensions;
alter function public.handle_profile_role() set search_path = public, extensions;
alter function public.delete_user(uuid) set search_path = public, extensions;
alter function public.create_company(text, text, text, text) set search_path = public, extensions;