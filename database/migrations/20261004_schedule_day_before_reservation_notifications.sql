-- Send one reminder per participant for each fully approved reservation tomorrow.
-- The job runs at 09:00 Asia/Manila (01:00 UTC).

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_day_before_unique_idx
    ON public.user_notifications (recipient_user_id, reservation_id, type)
    WHERE type = 'reservation_reminder_day_before';

CREATE OR REPLACE FUNCTION public.create_day_before_reservation_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count integer;
BEGIN
    WITH eligible_reservations AS (
        SELECT
            r.reservation_id,
            r.user_id,
            r.reservation_date,
            r.start_time,
            owner.role AS owner_role,
            owner.professor::text AS assigned_professor,
            r.professor AS reservation_professor
        FROM public.reservations AS r
        JOIN public.user_info AS owner ON owner.id = r.user_id
        WHERE r.reservation_date = (now() AT TIME ZONE 'Asia/Manila')::date + 1
          AND r.is_deleted = false
          AND r.professor_approval = 'Approved'
          AND r.admin_approval = 'Approved'
          AND r.status IN ('Approved', 'Ongoing')
    ), recipients AS (
        SELECT reservation_id, reservation_date, start_time, user_id AS recipient_user_id
        FROM eligible_reservations

        UNION

        SELECT e.reservation_id, e.reservation_date, e.start_time, assigned_professor.id
        FROM eligible_reservations AS e
        JOIN LATERAL (
            SELECT p.id
            FROM public.user_info AS p
            WHERE e.owner_role = 'student'
              AND p.role = 'professor'
              AND (
                    p.id::text = e.assigned_professor
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(e.reservation_professor), '')
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(e.assigned_professor), '')
              )
            ORDER BY CASE
                WHEN p.id::text = e.assigned_professor THEN 0
                WHEN concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(e.reservation_professor), '') THEN 1
                ELSE 2
            END
            LIMIT 1
        ) AS assigned_professor ON true
    )
    INSERT INTO public.user_notifications (
        recipient_user_id, title, message, type, reservation_id
    )
    SELECT
        recipient_user_id,
        'Reservation tomorrow',
        'Reservation #' || reservation_id || ' is scheduled for ' || reservation_date || ' at ' || to_char(start_time, 'HH12:MI AM') || '.',
        'reservation_reminder_day_before',
        reservation_id
    FROM recipients
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_day_before_reservation_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_day_before_reservation_notifications() TO postgres;

DO $$
DECLARE
    existing_job_id bigint;
BEGIN
    SELECT jobid INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'day_before_reservation_notifications';

    IF existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
        'day_before_reservation_notifications',
        '0 1 * * *',
        'SELECT public.create_day_before_reservation_notifications();'
    );
END;
$$;
