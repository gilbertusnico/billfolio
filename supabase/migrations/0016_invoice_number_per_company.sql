-- Prevent duplicate invoice numbers within a company, including concurrent saves.
create unique index if not exists invoices_company_id_number_key
  on public.invoices (company_id, number);
