-- Day-before reminders belong only to the reservation owner.
-- The cron schedule remains 09:00 Asia/Manila (01:00 UTC).

CREATE OR REPLACE FUNCTION public.create_day_before_reservation_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count integer;
BEGIN
    INSERT INTO public.user_notifications (
        recipient_user_id, title, message, type, reservation_id
    )
    SELECT
        r.user_id,
        'Reservation tomorrow',
        'Reservation #' || r.reservation_id || ' is scheduled for ' || r.reservation_date || ' at ' || to_char(r.start_time, 'HH12:MI AM') || '.',
        'reservation_reminder_day_before',
        r.reservation_id
    FROM public.reservations AS r
    WHERE r.reservation_date = (now() AT TIME ZONE 'Asia/Manila')::date + 1
      AND r.is_deleted = false
      AND r.professor_approval = 'Approved'
      AND r.admin_approval = 'Approved'
      AND r.status IN ('Approved', 'Ongoing')
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_day_before_reservation_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_day_before_reservation_notifications() TO postgres;
