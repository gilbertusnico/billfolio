-- Remove plaintext password storage and public status mutation.
-- Existing administrator passwords must be rotated after this migration is applied.

alter table public.profiles drop column if exists raw_password;

-- A username is not a privilege boundary. Role assignment is only performed by
-- the explicitly authorised admin_create_user RPC below.
create or replace function public.handle_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.admin_create_user(
  p_username text,
  p_password text,
  p_role text default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only a Super Admin can create users'; end if;
  if p_username is null or length(trim(p_username)) < 2 then raise exception 'Username must be at least 2 characters'; end if;
  if p_password is null or length(p_password) < 12 then raise exception 'Password must be at least 12 characters'; end if;
  if p_role not in ('user', 'super_admin') then raise exception 'Invalid user role'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_username)) || '@internal.app', crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')), '{}'::jsonb,
    '', '', '', '', '', '', '', '', now(), now()
  ) returning id into v_id;

  insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', lower(trim(p_username)) || '@internal.app'), 'email', now(), now());

  insert into public.profiles (id, username, role)
  values (v_id, lower(trim(p_username)), p_role);
  return v_id;
end;
$$;

create or replace function public.update_user(p_user_id uuid, p_username text, p_role text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorized'; end if;
  if p_user_id = auth.uid() then raise exception 'Use Settings to change your own account'; end if;
  if p_username is not null and length(trim(p_username)) < 2 then raise exception 'Username must be at least 2 characters'; end if;
  if p_password is not null and length(p_password) < 12 then raise exception 'Password must be at least 12 characters'; end if;
  if p_role is not null and p_role not in ('user', 'super_admin') then raise exception 'Invalid user role'; end if;

  update public.profiles set username = coalesce(p_username, username), role = coalesce(p_role, role), updated_at = now() where id = p_user_id;
  if p_username is not null then update auth.users set email = lower(trim(p_username)) || '@internal.app', updated_at = now() where id = p_user_id; end if;
  if p_password is not null then update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user_id; end if;
end;
$$;

-- A public link may report a transfer, but cannot verify or change payment status.
alter table public.invoices add column if not exists payment_reported_at timestamptz null;
drop function if exists public.mark_invoice_paid(uuid);

create or replace function public.report_invoice_payment(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
     set payment_reported_at = coalesce(payment_reported_at, now()),
         updated_at = now()
   where id = p_invoice_id and status = 'PENDING';
  return found;
end;
$$;

revoke all on function public.report_invoice_payment(uuid) from public;
grant execute on function public.report_invoice_payment(uuid) to anon, authenticated;
