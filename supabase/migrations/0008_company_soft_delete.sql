-- ============================================================================
-- BillFolio — Soft-delete for companies (Super Admin only)
-- ----------------------------------------------------------------------------
-- WHY: the /admin/companies page ("Companies & Access") gets a Delete action.
-- Instead of a hard DELETE (which cascades away every client, bank account and
-- invoice), we set companies.deleted_at:
--
--   * companies_select policy hides soft-deleted rows from EVERY role (owner
--     and members included) — the workspace disappears from the sidebar picker.
--   * admin_list_all_companies() excludes them — they vanish from the admin
--     list too.
--   * get_public_invoice() refuses to join a soft-deleted company — public
--     invoice links for a deleted workspace stop working.
--   * admin_soft_delete_company(uuid) is the ONLY writer (Super Admin only,
--     enforced inside the security-definer function).
--   * Restore = UPDATE companies SET deleted_at = NULL WHERE id = '...';  (SQL)
--
-- IDEMPOTENT — safe to re-run (alter ... add column if not exists /
-- drop policy if exists / create or replace).
-- ============================================================================

alter table public.companies add column if not exists deleted_at timestamptz;

-- ----------------------------------------------------------------------------
-- Soft-delete RPC — Super Admin only
-- ----------------------------------------------------------------------------
create or replace function public.admin_soft_delete_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete companies';
  end if;
  update public.companies
     set deleted_at = now(),
         updated_at = now()
   where id = p_company_id;
  if not found then
    raise exception 'Company not found';
  end if;
end;
$$;

revoke all on function public.admin_soft_delete_company(uuid) from public, anon;
grant execute on function public.admin_soft_delete_company(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Hide soft-deleted workspaces from every everyday query path
-- ----------------------------------------------------------------------------
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies for select
  using (deleted_at is null and (owner_id = auth.uid() or public.is_company_member(id)));

-- ----------------------------------------------------------------------------
-- Admin "list all" — active companies only
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_all_companies()
returns setof public.companies
language sql
security definer
set search_path = public, extensions
stable
as $$
  select c.* from public.companies c
  where public.is_super_admin() and c.deleted_at is null;
$$;

revoke all on function public.admin_list_all_companies() from public, anon;
grant execute on function public.admin_list_all_companies() to authenticated;

-- ----------------------------------------------------------------------------
-- Public invoice links die with a soft-deleted workspace
-- ----------------------------------------------------------------------------
create or replace function public.get_public_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'number', i.number,
      'client_id', i.client_id,
      'client_snapshot', i.client_snapshot,
      'project_name', coalesce(i.project_name, ''),
      'invoice_date', i.invoice_date,
      'due_date', i.due_date,
      'tax_rate', i.tax_rate,
      'bank_account_id', i.bank_account_id,
      'bank_snapshot', i.bank_snapshot,
      'notes', coalesce(i.notes, ''),
      'status', i.status,
      'items', i.items,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ),
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'email', coalesce(c.email, ''),
      'address', coalesce(c.address, ''),
      'logo_url', coalesce(c.logo_url, ''),
      'currency', coalesce(c.currency, 'USD'),
      'styling', coalesce(c.styling, '{}'::jsonb)
    )
  ) into v_out
  from public.invoices i
  join public.companies c on c.id = i.company_id
  where i.id = p_invoice_id
    and c.deleted_at is null;

  return v_out;
end;
$$;

revoke all on function public.get_public_invoice(uuid) from public;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;