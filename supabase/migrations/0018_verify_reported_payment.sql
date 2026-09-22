-- Allow an authorised company member to verify a manual bank-transfer report
-- and convert the invoice to PAID. This keeps the public /i/:id flow restricted
-- to recording a report only; only a signed-in team member can actually confirm it.

create or replace function public.verify_reported_payment(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.invoices
  where id = p_invoice_id;

  if v_company_id is null then
    return false;
  end if;

  if not (public.is_super_admin() or public.is_company_member(v_company_id)) then
    raise exception 'Not authorized';
  end if;

  update public.invoices
     set status = 'PAID',
         paid_at = coalesce(paid_at, now()),
         payment_reported_at = coalesce(payment_reported_at, now()),
         updated_at = now()
   where id = p_invoice_id
     and status = 'PENDING'
     and payment_reported_at is not null;

  return found;
end;
$$;

revoke all on function public.verify_reported_payment(uuid) from public;
grant execute on function public.verify_reported_payment(uuid) to authenticated;
