-- Notify reservation owners and assigned professors about asset quantities
-- still outstanding after the reservation end time. Runs at 09:00 Manila.

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_unreturned_unique_idx
    ON public.user_notifications (recipient_user_id, reservation_id, type)
    WHERE type IN ('unreturned_items_owner', 'unreturned_items_student')
      AND reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_unreturned_item_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count integer;
BEGIN
    WITH overdue_reservations AS (
        SELECT DISTINCT
            r.reservation_id,
            r.user_id,
            r.reservation_date,
            owner.role AS owner_role,
            owner.first_name,
            owner.last_name,
            owner.professor::text AS assigned_professor,
            r.professor AS reservation_professor
        FROM public.reservations AS r
        JOIN public.user_info AS owner ON owner.id = r.user_id
        JOIN public.reservation_items AS item ON item.reservation_id = r.reservation_id
        WHERE r.is_deleted = false
          AND r.reservation_date + r.end_time < (now() AT TIME ZONE 'Asia/Manila')
          AND r.status IN ('Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed')
          AND item.is_deleted = false
          AND item.is_returned = false
          AND item.quantity_returned < item.quantity_borrowed
    ), recipients AS (
        SELECT
            reservation_id,
            user_id AS recipient_user_id,
            'unreturned_items_owner'::text AS notification_type,
            CASE WHEN owner_role = 'professor'
                THEN 'Unreturned items in your reservation'
                ELSE 'Unreturned items reminder'
            END AS notification_title,
            CASE WHEN owner_role = 'professor'
                THEN 'Your reservation #' || reservation_id || ' still has items to return.'
                ELSE 'Your reservation #' || reservation_id || ' still has items to return.'
            END AS notification_message
        FROM overdue_reservations

        UNION

        SELECT
            overdue.reservation_id,
            professor.id,
            'unreturned_items_student'::text,
            'Student has unreturned items',
            concat_ws(' ', overdue.first_name, overdue.last_name)
                || ' has unreturned item(s) for reservation #'
                || overdue.reservation_id || '.'
        FROM overdue_reservations AS overdue
        JOIN LATERAL (
            SELECT p.id
            FROM public.user_info AS p
            WHERE overdue.owner_role = 'student'
              AND p.role = 'professor'
              AND (
                    p.id::text = overdue.assigned_professor
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(overdue.reservation_professor), '')
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(overdue.assigned_professor), '')
              )
            ORDER BY CASE
                WHEN p.id::text = overdue.assigned_professor THEN 0
                WHEN concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(overdue.reservation_professor), '') THEN 1
                ELSE 2
            END
            LIMIT 1
        ) AS professor ON true
    )
    INSERT INTO public.user_notifications (
        recipient_user_id, title, message, type, reservation_id
    )
    SELECT recipient_user_id, notification_title, notification_message,
           notification_type, reservation_id
    FROM recipients
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_unreturned_item_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_unreturned_item_notifications() TO postgres;

DO $$
DECLARE
    existing_job_id bigint;
BEGIN
    SELECT jobid INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'unreturned_item_notifications';

    IF existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
        'unreturned_item_notifications',
        '0 1 * * *',
        'SELECT public.create_unreturned_item_notifications();'
    );
END;
$$;
