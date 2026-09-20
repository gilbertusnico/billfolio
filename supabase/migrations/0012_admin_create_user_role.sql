-- Allow Super Admins to choose the role when creating a user.

drop function if exists public.admin_create_user(text, text);

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
declare
  v_id uuid;
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
  if p_role not in ('user', 'super_admin') then
    raise exception 'Invalid user role';
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
  values (v_id, lower(trim(p_username)), p_role, p_password);

  return v_id;
end;
$$;

revoke all on function public.admin_create_user(text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text) to authenticated;