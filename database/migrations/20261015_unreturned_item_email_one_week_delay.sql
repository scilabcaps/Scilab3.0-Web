-- Delay professor email delivery until the reservation is at least one full week overdue.
-- In-app notifications continue to be created by the existing overdue-item function.

CREATE OR REPLACE FUNCTION public.claim_unreturned_item_email(p_limit integer DEFAULT 25)
RETURNS TABLE (
    id bigint,
    recipient_email text,
    recipient_name text,
    student_name text,
    student_year_section text,
    student_course text,
    student_email text,
    reservation_date date,
    end_time time,
    items jsonb,
    attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT o.id
        FROM public.unreturned_item_email_outbox AS o
        JOIN public.reservations AS r ON r.reservation_id = o.reservation_id
        WHERE o.status IN ('pending', 'failed')
          AND o.attempts < 5
          AND (o.locked_at IS NULL OR o.locked_at < now() - interval '15 minutes')
          AND r.reservation_date + r.end_time <= (now() AT TIME ZONE 'Asia/Manila') - interval '7 days'
        ORDER BY o.created_at
        FOR UPDATE OF o SKIP LOCKED
        LIMIT greatest(coalesce(p_limit, 25), 1)
    )
    UPDATE public.unreturned_item_email_outbox AS o
       SET status = 'processing', attempts = o.attempts + 1, locked_at = now(), last_error = NULL
      FROM claimed
     WHERE o.id = claimed.id
    RETURNING o.id, o.recipient_email, o.recipient_name, o.student_name,
              o.student_year_section, o.student_course, o.student_email,
              o.reservation_date, o.end_time, o.items, o.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_unreturned_item_email(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_unreturned_item_email(integer) TO service_role;
