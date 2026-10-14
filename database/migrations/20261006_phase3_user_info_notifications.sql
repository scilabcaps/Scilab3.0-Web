-- Phase 3: secure identity records and broadcast notifications.
-- Existing rows are preserved; this migration changes policies/functions only.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role) FROM public.user_info WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Replace role checks that would recurse after user_info RLS is enabled.
DROP POLICY IF EXISTS "Admin/librarian/professor manage chemical usage" ON public.chemical_usage;
CREATE POLICY "Admin/librarian/professor manage chemical usage" ON public.chemical_usage
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian manage chemicals" ON public.chemicals;
CREATE POLICY "Admin/librarian manage chemicals" ON public.chemicals
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admin/librarian manage lab assets" ON public.lab_assets;
CREATE POLICY "Admin/librarian manage lab assets" ON public.lab_assets
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admin/librarian can update lab_assets" ON public.reservation_items;
CREATE POLICY "Admin/librarian can update lab_assets" ON public.reservation_items
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admin/librarian can view reservation_items" ON public.reservation_items;
CREATE POLICY "Admin/librarian can view reservation_items" ON public.reservation_items
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admin/librarian/professor manage reservation items" ON public.reservation_items;
CREATE POLICY "Admin/librarian/professor manage reservation items" ON public.reservation_items
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian/professor can create reservations" ON public.reservations;
CREATE POLICY "Admin/librarian/professor can create reservations" ON public.reservations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian/professor can delete reservations" ON public.reservations;
CREATE POLICY "Admin/librarian/professor can delete reservations" ON public.reservations
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian/professor can update reservations" ON public.reservations;
CREATE POLICY "Admin/librarian/professor can update reservations" ON public.reservations
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian/professor can view reservations" ON public.reservations;
CREATE POLICY "Admin/librarian/professor can view reservations" ON public.reservations
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian/professor manage reservations" ON public.reservations;
CREATE POLICY "Admin/librarian/professor manage reservations" ON public.reservations
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian', 'professor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian manage rooms" ON public.rooms;
CREATE POLICY "Admin/librarian manage rooms" ON public.rooms
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admin/librarian can insert stock_history" ON public.stock_history;
CREATE POLICY "Admin/librarian can insert stock_history" ON public.stock_history
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian', 'professor'));

DROP POLICY IF EXISTS "Admin/librarian manage stock history" ON public.stock_history;
CREATE POLICY "Admin/librarian manage stock history" ON public.stock_history
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admins and librarians manage announcements" ON public.announcement;
CREATE POLICY "Admins and librarians manage announcements" ON public.announcement
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

DROP POLICY IF EXISTS "Admins and librarians read audit logs" ON public.audit_logs;
CREATE POLICY "Admins and librarians read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'));

-- Protect user_info from anonymous reads, arbitrary inserts, and self-promotion.
ALTER TABLE public.user_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.user_info;
DROP POLICY IF EXISTS "Allow users to read their own profile" ON public.user_info;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_info;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.user_info;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_info;
DROP POLICY IF EXISTS "Admin/librarian manage users" ON public.user_info;

-- Existing joins and professor/student screens require authenticated profile reads.
-- Sensitive privilege fields are protected by the update trigger below.
CREATE POLICY "Authenticated users read profiles" ON public.user_info
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users create own student profile" ON public.user_info
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND lower(role) = 'student'
    AND coalesce("isApproved", 0) = 0
  );

CREATE POLICY "Admins and librarians manage users" ON public.user_info
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

CREATE POLICY "Users update own profile" ON public.user_info
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_user_info_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'librarian') AND (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.username IS DISTINCT FROM NEW.username OR
    OLD.role IS DISTINCT FROM NEW.role OR
    OLD.is_banned IS DISTINCT FROM NEW.is_banned OR
    OLD."isApproved" IS DISTINCT FROM NEW."isApproved" OR
    OLD.year_section IS DISTINCT FROM NEW.year_section OR
    OLD.professor IS DISTINCT FROM NEW.professor OR
    OLD.course IS DISTINCT FROM NEW.course
  ) THEN
    RAISE EXCEPTION 'Only administrators can change account privileges or assignments';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_info_privileges ON public.user_info;
CREATE TRIGGER protect_user_info_privileges
  BEFORE UPDATE ON public.user_info
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_info_privileges();
REVOKE ALL ON FUNCTION public.protect_user_info_privileges() FROM PUBLIC, anon, authenticated;

-- Notifications are created through a controlled function, not direct table writes.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Admins and librarians view notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'));
CREATE POLICY "Admins and librarians update notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'librarian'))
  WITH CHECK (public.current_user_role() IN ('admin', 'librarian'));

CREATE OR REPLACE FUNCTION public.create_admin_notification(
  p_title text,
  p_message text,
  p_type text DEFAULT 'general',
  p_related_id text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id bigint DEFAULT NULL,
  p_action text DEFAULT 'view'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.notifications(title, message, type, related_id, entity_type, entity_id, action)
  VALUES (p_title, p_message, coalesce(p_type, 'general'), p_related_id, p_entity_type, p_entity_id, coalesce(p_action, 'view'))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_notification(text, text, text, text, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_notification(text, text, text, text, text, bigint, text) TO authenticated;
