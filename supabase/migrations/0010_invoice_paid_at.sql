-- Record when an invoice transitions to PAID.
alter table public.invoices
  add column if not exists paid_at timestamptz null;

-- Public invoice payload includes the payment timestamp. Keep soft-deleted
-- companies unavailable through public links.
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
      'discount', i.discount,
      'paid_at', i.paid_at,
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
