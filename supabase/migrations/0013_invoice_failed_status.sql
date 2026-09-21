alter table public.invoices drop constraint if exists invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('DRAFT', 'PENDING', 'PAID', 'FAILED'));