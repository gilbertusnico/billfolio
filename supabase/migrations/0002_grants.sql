-- ============================================================================
-- BillFolio — Fix: missing table grants for PostgREST roles
-- ----------------------------------------------------------------------------
-- Symptoms: "permission denied for table companies" (and clients / invoices /
-- profiles / ...) on any authenticated query.
--
-- Why: 0001_init.sql creates tables + RLS policies, but RLS policies only tell
-- PostgREST WHICH rows a role may touch. The role still needs table-level
-- GRANTs or PostgreSQL refuses with "permission denied for table ..." before
-- RLS is even evaluated. Some Supabase projects pre-grant these by default;
-- in this one they are absent.
--
-- Fix: run this file in the SQL Editor (Dashboard → SQL → New query). It is
-- idempotent — safe to run as many times as you like. Tables are also granted
-- (and enforced purely) via RLS policies from 0001_init.sql.
-- ============================================================================

-- Reach the public schema (harmless if already granted).
grant usage on schema public to anon, authenticated;

-- Row-level access is decided by the RLS policies in 0001_init.sql.
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;