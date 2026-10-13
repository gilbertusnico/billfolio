CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_username text,
  p_password text,
  p_role text DEFAULT 'user'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can create users';
  END IF;
  IF p_username IS NULL OR length(trim(p_username)) < 2 THEN
    RAISE EXCEPTION 'Username must be at least 2 characters';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF p_role NOT IN ('user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid user role';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current,
    reauthentication_token, phone_change, phone_change_token, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(trim(p_username)) || '@internal.app', crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')), '{}'::jsonb,
    '', '', '', '', '', '', '', '', now(), now()
  )
  RETURNING id INTO v_id;

  INSERT INTO auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
  VALUES (
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(trim(p_username)) || '@internal.app'),
    'email',
    now(),
    now()
  );

  INSERT INTO public.profiles (id, username, role)
  VALUES (v_id, lower(trim(p_username)), p_role);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user(
  p_user_id uuid,
  p_username text,
  p_role text,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use Settings to change your own password';
  END IF;
  IF p_username IS NOT NULL AND length(trim(p_username)) < 2 THEN
    RAISE EXCEPTION 'Username must be at least 2 characters';
  END IF;
  IF p_password IS NOT NULL AND length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid user role';
  END IF;

  UPDATE public.profiles
  SET username = coalesce(p_username, username),
      role = coalesce(p_role, role),
      updated_at = now()
  WHERE id = p_user_id;

  IF p_username IS NOT NULL THEN
    UPDATE auth.users
    SET email = lower(trim(p_username)) || '@internal.app',
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  IF p_password IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_user(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user(uuid, text, text, text) TO authenticated;
