-- ============================================================================
-- BillFolio — Scope Super Admin's workspace picker to owned/member companies
-- ----------------------------------------------------------------------------
-- WHY: the old `companies_select` policy let a Super Admin SELECT *every*
-- company (`or public.is_super_admin()`), so the sidebar workspace switcher
-- listed workspaces the admin neither owns nor is a member of — and switching
-- to one was useless anyway, because invoices / clients / bank-accounts RLS
-- still require membership (`is_company_member`).
--
-- This migration:
--   1. Removes the Super Admin bypass from `companies_select`, so the picker
--      behaves identically for every role: you only see workspaces you own or
--      are a member of.
--   2. Adds `admin_list_all_companies()` — a security-definer RPC (Super Admin
--      only, enforced inside the function) that still returns every company,
--      so the /admin/companies page ("Companies & Access") keeps working.
--
-- IDEMPOTENT — safe to re-run (drop policy if exists / create or replace).
-- ============================================================================

drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select
  using (owner_id = auth.uid() or public.is_company_member(id));

create or replace function public.admin_list_all_companies()
returns setof public.companies
language sql
security definer
set search_path = public, extensions
stable
as $$
  select c.* from public.companies c where public.is_super_admin();
$$;

revoke all on function public.admin_list_all_companies() from public, anon;
grant execute on function public.admin_list_all_companies() to authenticated;