-- ============================================================================
-- Repair malformed Auth users created by the original admin RPC
-- ----------------------------------------------------------------------------
-- This keeps profiles, companies and memberships intact. It only rebuilds the
-- email identity and restores required non-null Auth token fields.
-- ============================================================================

-- Remove identities created by the previous repair attempt so they can be
-- recreated with all standard identity fields populated.
delete from auth.identities i
using auth.users u
where i.user_id = u.id
  and u.email like '%@internal.app';

-- Restore the Auth fields required by password sign-in for every internal user.
update auth.users u
set email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    updated_at = now()
where u.email like '%@internal.app';

-- Recreate the email identity expected by Supabase Auth.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(),
  now()
from auth.users u
where u.email like '%@internal.app';
