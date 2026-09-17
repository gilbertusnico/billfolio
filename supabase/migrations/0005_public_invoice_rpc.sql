-- ============================================================================
-- BillFolio — public invoice link RPCs (route /i/:id) + realtime sync
-- ----------------------------------------------------------------------------
-- 1. get_public_invoice(id)  → read ONE invoice + its company (security definer)
-- 2. mark_invoice_paid(id)   → flip PENDING → PAID (called from the public page)
-- 3. add invoices to the realtime publication so the dashboard updates live
--
-- WHY security definer: the anon role has NO grants on any public.* table
-- (only authenticated does — see 0001_init.sql + 0002_grants.sql), so a
-- client-side "public link" cannot read the tables directly. These two RPCs
-- are the ONLY way an anonymous visitor can read/update an invoice.
--
-- NOTE: anyone with the anon key can mark any PENDING invoice as PAID — that is
-- the intended trade-off of a public "I've paid" button. We restrict the update
-- to status = 'PENDING' so paid/draft invoices can never be toggled back.
-- ============================================================================

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
  where i.id = p_invoice_id;

  return v_out;
end;
$$;

revoke all on function public.get_public_invoice(uuid) from public;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;

-- "Press this button if you've PAID" → PENDING → PAID. Returns false when the
-- invoice is NOT pending (already paid / draft), so nothing is ever reverted.
create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
     set status = 'PAID',
         updated_at = now()
   where id = p_invoice_id
     and status = 'PENDING';
  return found;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid) from public;
grant execute on function public.mark_invoice_paid(uuid) to anon, authenticated;

-- Realtime publication: so a client clicking PAID on /i/:id updates the admin
-- Invoices table instantly (fallback: refetch on window focus).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;  -- already a member → nothing to do
end $$;