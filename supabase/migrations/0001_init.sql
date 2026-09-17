-- ============================================================================
-- BillFolio — Supabase schema, Row Level Security & Super Admin seed
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL → New query),
-- or with the Supabase CLI:  supabase db push
--
-- What it creates:
--   * profiles            (one per auth user — username, role, raw_password)
--   * companies           (workspaces, incl. per-company invoice styling JSONB)
--   * company_members     (multi-tenant access: which users see a company)
--   * clients / bank_accounts / invoices   (scoped to company_id)
--   * RLS policies        (owners, members and super admins only)
--   * security-definer admin RPCs used by the /users and /companies pages
--   * Super Admin account:  username `Nico` · password `Nico123`
--
-- ORDERING MATTERS: all tables are created BEFORE the RLS helper functions.
-- PostgreSQL validates `language sql` function bodies at CREATE time, so a
-- function may only reference relations that already exist (otherwise the
-- SQL Editor fails with 42P01 "relation does not exist").
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  role        text not null default 'user' check (role in ('user', 'super_admin')),
  raw_password text,          -- plaintext mirror for the internal admin panel
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- companies  (styling JSONB holds { settings, template } per company)
create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  email      text not null default '',
  address    text not null default '',
  logo_url   text not null default '',
  currency   text not null default 'USD',
  styling    jsonb not null default '{
    "settings": { "lastSequence": 0, "invoicePrefix": "INV-", "defaultTaxRate": 0 },
    "template": {
      "invoiceTitleColor": "#2563eb",
      "companyNameColor": "#0f172a",
      "topBorder":  { "visible": false, "color": "#2563eb", "thickness": 4 },
      "bottomBorder": { "visible": false, "color": "#2563eb", "thickness": 4 },
      "table": { "headerStyle": "filled", "headerColor": "#eff6ff", "zebra": false }
    }
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- company_members  (multi-tenant access grants)
create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- clients  (scoped to a company)
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,
  contact_company text not null default '',
  email           text not null default '',
  phone           text not null default '',
  address         text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- bank_accounts
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  account_number text not null default '',
  holder         text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- invoices  (line items are stored as JSONB on the row for atomic saves)
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  number           text not null,
  client_id        uuid references public.clients(id) on delete set null,
  client_snapshot  jsonb,
  project_name     text not null default '',
  invoice_date     date not null,
  due_date         date not null,
  tax_rate         numeric not null default 0,
  bank_account_id  uuid references public.bank_accounts(id) on delete set null,
  bank_snapshot    jsonb,
  notes            text not null default '',
  status           text not null default 'DRAFT' check (status in ('DRAFT', 'PENDING', 'PAID')),
  items            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS helper functions (security definer so policies don't recurse).
-- NOTE: created AFTER the tables — `language sql` bodies are validated at
-- CREATE time, so every referenced relation must already exist.
-- ----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.is_company_member(company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = $1 and m.user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security & policies (helper functions above must exist first)
-- ----------------------------------------------------------------------------

-- profiles
alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
create policy "profiles_delete" on public.profiles
  for delete using (public.is_super_admin());

-- companies
alter table public.companies enable row level security;

create policy "companies_select" on public.companies for select
  using (owner_id = auth.uid() or public.is_company_member(id) or public.is_super_admin());
create policy "companies_insert" on public.companies for insert
  with check (owner_id = auth.uid());
create policy "companies_update" on public.companies for update
  using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());
create policy "companies_delete" on public.companies for delete
  using (owner_id = auth.uid() or public.is_super_admin());

-- company_members
alter table public.company_members enable row level security;

create policy "members_select" on public.company_members for select
  using (user_id = auth.uid() or public.is_super_admin());
create policy "members_insert" on public.company_members for insert
  with check (public.is_super_admin() or (select c.owner_id = auth.uid() from public.companies c where c.id = company_id));
create policy "members_delete" on public.company_members for delete
  using (user_id = auth.uid() or public.is_super_admin());

-- clients
alter table public.clients enable row level security;

create policy "clients_all" on public.clients for all
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- bank_accounts
alter table public.bank_accounts enable row level security;

create policy "bank_accounts_all" on public.bank_accounts for all
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- invoices
alter table public.invoices enable row level security;

create policy "invoices_all" on public.invoices for all
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- ----------------------------------------------------------------------------
-- Trigger: reserved username "Nico" always boots as super admin; every other
-- self-registered profile is forced to role=user (no self-elevation).
-- ----------------------------------------------------------------------------

create or replace function public.handle_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and lower(new.username) = 'nico' then
    new.role := 'super_admin';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_role on public.profiles;
create trigger trg_profiles_role
  before insert or update on public.profiles
  for each row execute function public.handle_profile_role();

-- ----------------------------------------------------------------------------
-- Admin RPCs (security definer — the ONLY way to manage auth users client-side)
-- ----------------------------------------------------------------------------

-- Create a user (auth user + profile) — Super Admin only.
create or replace function public.admin_create_user(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can create users';
  end if;
  if p_username is null or length(trim(p_username)) < 2 then
    raise exception 'Username must be at least 2 characters';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_username)) || '@internal.app', crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now(), now()
  )
  returning id into v_id;

  insert into public.profiles (id, username, role, raw_password)
  values (v_id, lower(trim(p_username)), 'user', p_password);

  return v_id;
end;
$$;

revoke all on function public.admin_create_user(text, text) from public, anon;
grant execute on function public.admin_create_user(text, text) to authenticated;

-- Update a user's profile (username / role / optional password) — Super Admin only.
create or replace function public.update_user(p_user_id uuid, p_username text, p_role text, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use Settings to change your own account';
  end if;
  if p_username is not null and length(trim(p_username)) < 2 then
    raise exception 'Username must be at least 2 characters';
  end if;
  if p_password is not null and length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  update public.profiles
     set username    = coalesce(p_username, username),
         role        = coalesce(p_role, role),
         raw_password = coalesce(p_password, raw_password),
         updated_at  = now()
   where id = p_user_id;

  if p_password is not null then
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')) where id = p_user_id;
  end if;
end $$;

revoke execute on function public.update_user(uuid, text, text, text) from public, anon;
grant execute on function public.update_user(uuid, text, text, text) to authenticated;

-- Delete a user (auth user + everything that cascades) — Super Admin only.
create or replace function public.delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  delete from auth.users where id = p_user_id;
end $$;

revoke all on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- Create a company + owner membership in one call (any signed-in user).
create or replace function public.create_company(p_name text, p_email text default '', p_address text default '', p_logo_url text default '')
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare v_company public.companies;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Company name is required';
  end if;
  insert into public.companies (name, owner_id, email, address, logo_url)
  values (trim(p_name), auth.uid(), coalesce(p_email, ''), coalesce(p_address, ''), coalesce(p_logo_url, ''))
  returning * into v_company;
  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');
  return v_company;
end;
$$;

revoke all on function public.create_company(text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: Super Admin  (username: Nico · password: Nico123)
-- ----------------------------------------------------------------------------

do $$
declare v_id uuid;
begin
  -- Find-or-create the auth user by email. auth.users is NOT dropped when
  -- public tables are, so a stale sign-up (client auto-seed or an earlier
  -- partial run) may already own "nico@internal.app" and the old
  -- `if not exists` would skip BOTH inserts, leaving profiles empty.
  select id into v_id from auth.users where email = 'nico@internal.app';

  if v_id is null then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      'nico@internal.app', crypt('Nico123', gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      '{}'::jsonb, now(), now()
    )
    returning id into v_id;
  else
    -- Repair leftover account from a client-side sign-up: confirm it, or
    -- password login fails with "Email not confirmed".
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = v_id;
  end if;

  -- Idempotent profile upsert (always run) so a missing profile row is
  -- repaired instead of silently skipped.
  insert into public.profiles (id, username, role, raw_password)
  values (v_id, 'Nico', 'super_admin', 'Nico123')
  on conflict (id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- Grants for PostgREST roles (anon / authenticated)
-- RLS policies decide WHICH rows; these GRANTs decide whether the role may
-- reach the table at all. Without them every authenticated query fails with
-- "permission denied for table ...". Idempotent — safe on re-run.
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
