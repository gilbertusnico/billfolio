-- ============================================================================
-- BillFolio — Fix: admin-created users can't sign in (NULL auth token columns)
-- ----------------------------------------------------------------------------
-- Symptom:  POST /auth/v1/token?grant_type=password → HTTP 500
--           "error finding user: sql: Scan error on column index 3,
--            name \"confirmation_token\": converting NULL to string is unsupported"
--
-- Why:      admin_create_user inserted auth.users WITHOUT the token columns,
--           leaving them NULL. GoTrue scans these columns as plain strings, so
--           a NULL aborts the user lookup BEFORE the password is even checked.
--
-- Fix:
--   1) Rewrite admin_create_user to insert every token column as '' (not NULL)
--      and to set auth.identities.created_at/updated_at explicitly.
--   2) Rewrite update_user so a username rename keeps auth.users.email in sync
--      (same class of bug: after a rename, sign-in by username would fail).
--   3) Repair existing rows whose token columns are NULL, and backfill identity
--      timestamps created without them.
--
-- Idempotent: create-or-replace functions + guarded repairs, safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Create user RPC — token columns '' instead of NULL, identity timestamps
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_user(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token,
    phone_change, phone_change_token,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_username)) || '@internal.app', crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb,
    '', '', '', '',
    '', '',
    '', '',
    now(), now()
  )
  returning id into v_id;

  insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(trim(p_username)) || '@internal.app'),
    'email',
    now(), now()
  );

  insert into public.profiles (id, username, role, raw_password)
  values (v_id, lower(trim(p_username)), 'user', p_password);

  return v_id;
end;
$$;

revoke all on function public.admin_create_user(text, text) from public, anon;
grant execute on function public.admin_create_user(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Update user RPC — keep auth.users.email in sync with username on rename
-- ----------------------------------------------------------------------------
create or replace function public.update_user(p_user_id uuid, p_username text, p_role text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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
     set username     = coalesce(p_username, username),
         role         = coalesce(p_role, role),
         raw_password = coalesce(p_password, raw_password),
         updated_at   = now()
   where id = p_user_id;

  -- Sign-in resolves <username>@internal.app, so the auth email must follow a rename.
  if p_username is not null then
    update auth.users
       set email = lower(trim(p_username)) || '@internal.app'
     where id = p_user_id;
  end if;

  if p_password is not null then
    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf'))
     where id = p_user_id;
  end if;
end $$;

revoke execute on function public.update_user(uuid, text, text, text) from public, anon;
grant execute on function public.update_user(uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Repair existing rows — GoTrue scans token columns as strings, NULL breaks it
-- ----------------------------------------------------------------------------
update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       reauthentication_token     = coalesce(reauthentication_token, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change_token_new is null
    or email_change is null
    or email_change_token_current is null
    or reauthentication_token is null
    or phone_change is null
    or phone_change_token is null;

-- Backfill identity timestamps for rows created without them
update auth.identities i
   set created_at = coalesce(i.created_at, u.created_at),
       updated_at = coalesce(i.updated_at, u.updated_at)
  from auth.users u
 where u.id = i.user_id
   and (i.created_at is null or i.updated_at is null);
