-- Store invoice totals as database-owned values. The client may send items,
-- tax_rate, and discount, but these summary columns are always recalculated.
alter table public.invoices
  add column if not exists subtotal numeric not null default 0,
  add column if not exists tax_amount numeric not null default 0,
  add column if not exists grand_total numeric not null default 0;

create or replace function public.calculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
  quantity numeric;
  unit_price numeric;
  calculated_subtotal numeric := 0;
  normalized_tax_rate numeric;
  normalized_discount numeric;
begin
  for item in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    quantity := case
      when coalesce(item->>'quantity', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (item->>'quantity')::numeric
      else 0
    end;
    unit_price := case
      when coalesce(item->>'unitPrice', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (item->>'unitPrice')::numeric
      else 0
    end;
    calculated_subtotal := calculated_subtotal + greatest(0, quantity) * greatest(0, unit_price);
  end loop;

  normalized_tax_rate := least(100, greatest(0, coalesce(new.tax_rate, 0)));
  normalized_discount := greatest(0, coalesce(new.discount, 0));

  new.tax_rate := normalized_tax_rate;
  new.discount := normalized_discount;
  new.subtotal := calculated_subtotal;
  new.tax_amount := calculated_subtotal * normalized_tax_rate / 100;
  new.grand_total := greatest(0, calculated_subtotal - normalized_discount + new.tax_amount);
  return new;
end;
$$;

drop trigger if exists invoices_calculate_totals on public.invoices;
create trigger invoices_calculate_totals
before insert or update of items, tax_rate, discount on public.invoices
for each row execute function public.calculate_invoice_totals();

-- Backfill existing rows through the same trigger-owned calculation path.
update public.invoices set items = items;

-- Return database-calculated totals through public invoice links.
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
      'subtotal', i.subtotal,
      'tax_amount', i.tax_amount,
      'grand_total', i.grand_total,
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
