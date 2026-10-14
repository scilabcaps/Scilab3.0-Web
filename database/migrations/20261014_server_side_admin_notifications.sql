-- Create admin notifications in the database instead of relying on client-side calls.
-- Student reservations are sent to the professor first; admins are notified only
-- after professor approval. Professor-owned reservations are already professor-approved.

CREATE OR REPLACE FUNCTION public.create_admin_reservation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    owner_role text;
    owner_first_name text;
    owner_last_name text;
    owner_name text;
    notification_title text;
    notification_message text;
BEGIN
    SELECT role, first_name, last_name
      INTO owner_role, owner_first_name, owner_last_name
      FROM public.user_info
     WHERE id = NEW.user_id;

    owner_name := NULLIF(BTRIM(concat_ws(' ', owner_first_name, owner_last_name)), '');

    IF TG_OP = 'INSERT' AND owner_role = 'professor' THEN
        notification_title := 'New reservation submitted';
        notification_message := coalesce(owner_name, 'A professor')
            || ' submitted a new reservation for approval.';
    ELSIF TG_OP = 'UPDATE'
          AND owner_role = 'student'
          AND OLD.professor_approval IS DISTINCT FROM NEW.professor_approval
          AND NEW.professor_approval = 'Approved' THEN
        notification_title := 'Reservation ready for admin approval';
        notification_message := coalesce(owner_name, 'A student')
            || ' submitted a reservation for ' || NEW.reservation_date
            || ' and it is ready for admin approval.';
    ELSE
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.notifications
         WHERE type = 'reservation_submitted'
           AND entity_type = 'reservation'
           AND entity_id = NEW.reservation_id
           AND title = notification_title
    ) THEN
        INSERT INTO public.notifications (
            title, message, type, related_id, entity_type, entity_id, action
        )
        VALUES (
            notification_title,
            notification_message,
            'reservation_submitted',
            NEW.reservation_id::text,
            'reservation',
            NEW.reservation_id,
            'view'
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_reservation_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reservations_admin_notification_after_insert ON public.reservations;
CREATE TRIGGER reservations_admin_notification_after_insert
    AFTER INSERT ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.create_admin_reservation_notification();

DROP TRIGGER IF EXISTS reservations_admin_notification_after_professor_approval ON public.reservations;
CREATE TRIGGER reservations_admin_notification_after_professor_approval
    AFTER UPDATE OF professor_approval ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.create_admin_reservation_notification();

CREATE OR REPLACE FUNCTION public.create_admin_account_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IN ('student', 'professor')
       AND coalesce(NEW."isApproved", 0) = 0
       AND NOT EXISTS (
           SELECT 1
             FROM public.notifications
            WHERE type = 'account_submitted'
              AND related_id = NEW.id::text
       ) THEN
        INSERT INTO public.notifications (
            title, message, type, related_id, action
        )
        VALUES (
            'New account awaiting approval',
            concat_ws(' ', NEW.first_name, NEW.last_name)
                || ' submitted a ' || NEW.role || ' account for approval.',
            'account_submitted',
            NEW.id::text,
            'view'
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_account_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_info_admin_notification_after_insert ON public.user_info;
CREATE TRIGGER user_info_admin_notification_after_insert
    AFTER INSERT ON public.user_info
    FOR EACH ROW
    EXECUTE FUNCTION public.create_admin_account_notification();

-- Prevent the previous client-call RPC from being used after this migration.
DROP FUNCTION IF EXISTS public.create_admin_notification(text, text, text, text, text, bigint, text);
