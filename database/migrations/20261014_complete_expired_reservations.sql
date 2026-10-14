-- Mark expired, fully returned reservations as completed.
-- Runs every 15 minutes; reservation timestamps are interpreted in Asia/Manila.

CREATE OR REPLACE FUNCTION public.complete_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    completed_count integer;
BEGIN
    UPDATE public.reservations AS r
    SET status = 'Completed',
        updated_at = now()
    WHERE r.is_deleted = false
      AND r.professor_approval = 'Approved'
      AND r.admin_approval = 'Approved'
      AND r.status IN ('Approved', 'Ongoing')
      AND r.reservation_date + r.end_time < (now() AT TIME ZONE 'Asia/Manila')
      AND NOT EXISTS (
          SELECT 1
          FROM public.reservation_items AS item
          WHERE item.reservation_id = r.reservation_id
            AND item.is_deleted = false
            AND (
                item.is_returned = false
                OR item.quantity_returned < item.quantity_borrowed
            )
      );

    GET DIAGNOSTICS completed_count = ROW_COUNT;
    RETURN completed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_expired_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_expired_reservations() TO postgres;

DO $$
DECLARE
    existing_job_id bigint;
BEGIN
    SELECT jobid INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'complete_expired_reservations';

    IF existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
        'complete_expired_reservations',
        '*/15 * * * *',
        'SELECT public.complete_expired_reservations();'
    );
END;
$$;
