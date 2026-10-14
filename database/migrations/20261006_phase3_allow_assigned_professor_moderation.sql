-- Permit only the assigned-professor approval transition through the moderation RPC.
CREATE OR REPLACE FUNCTION public.protect_user_info_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'professor'
     AND OLD.role = 'student'
     AND OLD.professor = auth.uid()
     AND OLD."isApproved" = 0
     AND NEW.id = OLD.id
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.username IS NOT DISTINCT FROM OLD.username
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_banned IS NOT DISTINCT FROM OLD.is_banned
     AND NEW.year_section IS NOT DISTINCT FROM OLD.year_section
     AND NEW.professor IS NOT DISTINCT FROM OLD.professor
     AND NEW.course IS NOT DISTINCT FROM OLD.course
     AND NEW."isApproved" IN (1, 2)
  THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF public.current_user_role() NOT IN ('admin', 'librarian') AND (
    OLD.id IS DISTINCT FROM NEW.id OR OLD.email IS DISTINCT FROM NEW.email OR
    OLD.username IS DISTINCT FROM NEW.username OR OLD.role IS DISTINCT FROM NEW.role OR
    OLD.is_banned IS DISTINCT FROM NEW.is_banned OR OLD."isApproved" IS DISTINCT FROM NEW."isApproved" OR
    OLD.year_section IS DISTINCT FROM NEW.year_section OR OLD.professor IS DISTINCT FROM NEW.professor OR
    OLD.course IS DISTINCT FROM NEW.course
  ) THEN
    RAISE EXCEPTION 'Only administrators can change account privileges or assignments';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_info_privileges() FROM PUBLIC, anon, authenticated;
