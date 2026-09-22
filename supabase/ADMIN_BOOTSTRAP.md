# Creating the first administrator

BillFolio intentionally has no default administrator account and the browser never creates one.

1. Choose a username, then in the Supabase Dashboard create the first user in **Authentication → Users** with email `<username>@internal.app` and a strong password.
2. In the SQL Editor, run the following with the new user's UUID and the username that the app will use to sign in:

```sql
insert into public.profiles (id, username, role)
values ('<auth-user-uuid>', '<username>', 'super_admin');
```

The application signs in with `<username>@internal.app`, so the Auth email must use that exact format.

After the first administrator signs in, create all additional users from **Admin → Users**. Passwords are held only by Supabase Auth and are never stored in `public.profiles`.
