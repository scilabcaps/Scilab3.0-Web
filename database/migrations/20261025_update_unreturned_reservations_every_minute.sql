-- Re-evaluate expired reservations every minute and include the scheduled end instant.
CREATE OR REPLACE FUNCTION public.update_unreturned_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.reservations AS r
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.reservation_items AS ri
          WHERE ri.reservation_id = r.reservation_id
            AND (ri.is_deleted IS FALSE OR ri.is_deleted IS NULL)
            AND ri.is_returned IS NOT TRUE
        ) THEN 'Unreturned'
        ELSE 'Completed'
      END,
      updated_at = NOW()
  WHERE r.status IN ('Ongoing', 'Approved', 'Pending', 'Partially Returned')
    AND (r.is_deleted IS FALSE OR r.is_deleted IS NULL)
    AND (r.reservation_date + r.end_time) <= (NOW() AT TIME ZONE 'Asia/Manila');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'update_unreturned_reservations_job';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'update_unreturned_reservations_job',
    '* * * * *',
    'SELECT public.update_unreturned_reservations();'
  );
END;
$$;
