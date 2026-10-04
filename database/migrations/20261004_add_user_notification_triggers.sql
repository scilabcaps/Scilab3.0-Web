-- Create student/professor notifications from reservation lifecycle changes.
-- Uses the separate user_notifications table and leaves admin notifications alone.

CREATE OR REPLACE FUNCTION public.create_reservation_user_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    owner_role text;
    owner_first_name text;
    owner_last_name text;
    assigned_professor text;
    professor_user_id uuid;
    notification_title text;
    notification_message text;
BEGIN
    SELECT role, first_name, last_name, professor::text
      INTO owner_role, owner_first_name, owner_last_name, assigned_professor
      FROM public.user_info
     WHERE id = NEW.user_id;

    IF owner_role IS DISTINCT FROM 'student' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT id
          INTO professor_user_id
          FROM public.user_info
         WHERE role = 'professor'
           AND (
                id::text = assigned_professor
                OR concat_ws(' ', first_name, last_name) = NULLIF(BTRIM(NEW.professor), '')
                OR concat_ws(' ', first_name, last_name) = NULLIF(BTRIM(assigned_professor), '')
           )
         ORDER BY CASE
                    WHEN id::text = assigned_professor THEN 0
                    WHEN concat_ws(' ', first_name, last_name) = NULLIF(BTRIM(NEW.professor), '') THEN 1
                    ELSE 2
                  END
         LIMIT 1;

        IF professor_user_id IS NOT NULL THEN
            INSERT INTO public.user_notifications (recipient_user_id, title, message, type, reservation_id)
            VALUES (
                professor_user_id,
                'New reservation request',
                concat_ws(' ', owner_first_name, owner_last_name) || ' submitted a reservation for ' || NEW.reservation_date || '.',
                'reservation_submitted',
                NEW.reservation_id
            );
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.professor_approval IS DISTINCT FROM OLD.professor_approval
       AND NEW.professor_approval <> 'Pending' THEN
        notification_title := CASE NEW.professor_approval
            WHEN 'Approved' THEN 'Professor approved your reservation'
            WHEN 'Declined' THEN 'Professor declined your reservation'
            ELSE 'Professor updated your reservation'
        END;
        notification_message := 'Reservation #' || NEW.reservation_id || ' for ' || NEW.reservation_date || ' was ' || LOWER(NEW.professor_approval) || ' by your professor.';

        INSERT INTO public.user_notifications (recipient_user_id, title, message, type, reservation_id)
        VALUES (NEW.user_id, notification_title, notification_message, 'professor_approval_updated', NEW.reservation_id);
    END IF;

    IF NEW.admin_approval IS DISTINCT FROM OLD.admin_approval
       AND NEW.admin_approval <> 'Pending' THEN
        notification_title := CASE NEW.admin_approval
            WHEN 'Approved' THEN 'Admin approved your reservation'
            WHEN 'Declined' THEN 'Admin declined your reservation'
            WHEN 'Cancelled' THEN 'Your reservation was cancelled'
            ELSE 'Admin updated your reservation'
        END;
        notification_message := 'Reservation #' || NEW.reservation_id || ' for ' || NEW.reservation_date || ' was ' || LOWER(NEW.admin_approval) || ' by an administrator.';

        INSERT INTO public.user_notifications (recipient_user_id, title, message, type, reservation_id)
        VALUES (NEW.user_id, notification_title, notification_message, 'admin_approval_updated', NEW.reservation_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservation_user_notifications_after_insert ON public.reservations;
CREATE TRIGGER reservation_user_notifications_after_insert
    AFTER INSERT ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.create_reservation_user_notifications();

DROP TRIGGER IF EXISTS reservation_user_notifications_after_approval_update ON public.reservations;
CREATE TRIGGER reservation_user_notifications_after_approval_update
    AFTER UPDATE OF professor_approval, admin_approval ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.create_reservation_user_notifications();
