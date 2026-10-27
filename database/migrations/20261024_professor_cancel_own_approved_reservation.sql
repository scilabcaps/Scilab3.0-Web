-- Allow a professor to cancel only their own approved reservation before it starts.
CREATE OR REPLACE FUNCTION public.professor_cancel_own_approved_reservation(
    p_reservation_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    reservation_row public.reservations%ROWTYPE;
    caller_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to cancel a reservation.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role
      INTO caller_role
      FROM public.user_info
     WHERE id = auth.uid();

    IF caller_role IS DISTINCT FROM 'professor' THEN
        RAISE EXCEPTION 'Only a professor can cancel a professor reservation.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO reservation_row
      FROM public.reservations
     WHERE reservation_id = p_reservation_id
       AND user_id = auth.uid()
       AND COALESCE(is_deleted, false) = false
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found or not owned by the current professor.'
            USING ERRCODE = 'P0002';
    END IF;

    IF reservation_row.status <> 'Approved'
       OR reservation_row.professor_approval <> 'Approved'
       OR reservation_row.admin_approval <> 'Approved'
       OR (reservation_row.reservation_date + reservation_row.start_time) <= now() THEN
        RAISE EXCEPTION 'Only future, fully approved reservations can be cancelled.'
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

REVOKE ALL ON FUNCTION public.professor_cancel_own_approved_reservation(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_cancel_own_approved_reservation(integer) TO authenticated;
