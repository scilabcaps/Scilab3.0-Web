-- Anonymous signup needs only the professor directory, not access to user_info.
CREATE OR REPLACE FUNCTION public.get_professor_directory()
RETURNS TABLE (id uuid, first_name text, last_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.first_name, u.last_name
  FROM public.user_info AS u
  WHERE lower(u.role) = 'professor'
    AND coalesce(u.is_banned, false) = false
    AND coalesce(u."isApproved", 1) = 1
  ORDER BY u.first_name, u.last_name;
$$;

REVOKE ALL ON FUNCTION public.get_professor_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professor_directory() TO anon, authenticated;
