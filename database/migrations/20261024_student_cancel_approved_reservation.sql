-- Let a student cancel only their own upcoming reservation after both
-- professor and admin approvals are complete.
CREATE OR REPLACE FUNCTION public.student_cancel_approved_reservation(
    p_reservation_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    reservation_row public.reservations%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to cancel a reservation.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO reservation_row
      FROM public.reservations
     WHERE reservation_id = p_reservation_id
       AND user_id = auth.uid()
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found or not owned by the current user.'
            USING ERRCODE = 'P0002';
    END IF;

    IF reservation_row.status <> 'Approved'
       OR reservation_row.professor_approval <> 'Approved'
       OR reservation_row.admin_approval <> 'Approved'
       OR (reservation_row.reservation_date + reservation_row.start_time) <= now() THEN
        RAISE EXCEPTION 'Only upcoming, fully approved reservations can be cancelled.'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.reservations
       SET status = 'Cancelled',
           professor_approval = 'Cancelled',
           admin_approval = 'Cancelled',
           updated_at = now()
     WHERE reservation_id = p_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.student_cancel_approved_reservation(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_cancel_approved_reservation(integer) TO authenticated;
