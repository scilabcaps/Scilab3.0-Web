-- The trigger function is invoked by PostgreSQL only; it must not be callable through the API.
REVOKE ALL ON FUNCTION public.protect_user_info_privileges() FROM PUBLIC, anon, authenticated;
