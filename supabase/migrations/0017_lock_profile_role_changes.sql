-- Prevent authenticated users from assigning themselves elevated roles through
-- direct PostgREST writes to public.profiles. Role changes must use the
-- security-definer admin RPC, which checks public.is_super_admin().

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert
  with check (auth.uid() = id and role = 'user');

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
