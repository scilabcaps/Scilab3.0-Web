-- Atomically decline an assigned professor's pending reservation and restore
-- the inventory deducted when the reservation was submitted.
CREATE OR REPLACE FUNCTION public.decline_reservation_and_restore_inventory(
    p_reservation_id integer,
    p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    professor_name text;
    reservation_row public.reservations%ROWTYPE;
BEGIN
    SELECT concat_ws(' ', first_name, last_name)
      INTO professor_name
      FROM public.user_info
     WHERE id = auth.uid()
       AND role = 'professor';

    IF professor_name IS NULL OR BTRIM(professor_name) = '' THEN
        RAISE EXCEPTION 'Only an authenticated professor can decline a reservation.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO reservation_row
      FROM public.reservations
     WHERE reservation_id = p_reservation_id
       AND BTRIM(professor) = BTRIM(professor_name)
       AND professor_approval = 'Pending'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found, not assigned to you, or no longer pending.'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.reservations
       SET professor_approval = 'Declined',
           status = 'Declined',
           additional_note = CASE
               WHEN NULLIF(BTRIM(p_reason), '') IS NULL THEN additional_note
               WHEN NULLIF(BTRIM(additional_note), '') IS NULL THEN 'Rejection reason: ' || BTRIM(p_reason)
               ELSE additional_note || E'\nRejection reason: ' || BTRIM(p_reason)
           END,
           updated_at = now()
     WHERE reservation_id = p_reservation_id;

    UPDATE public.lab_assets AS asset
       SET available_stock = COALESCE(asset.available_stock, 0) + restored.quantity
      FROM (
          SELECT asset_id, SUM(quantity_borrowed)::integer AS quantity
            FROM public.reservation_items
           WHERE reservation_id = p_reservation_id
             AND COALESCE(is_deleted, false) = false
           GROUP BY asset_id
      ) AS restored
     WHERE asset.asset_id = restored.asset_id;

    UPDATE public.chemicals AS chemical
       SET stock_quantity = COALESCE(chemical.stock_quantity, 0) + restored.quantity
      FROM (
          SELECT chemical_id, SUM(quantity_used) AS quantity
            FROM public.chemical_usage
           WHERE reservation_id = p_reservation_id
             AND COALESCE(is_deleted, false) = false
           GROUP BY chemical_id
      ) AS restored
     WHERE chemical.chemical_id = restored.chemical_id;

    IF reservation_row.room_id IS NOT NULL THEN
        UPDATE public.rooms
           SET status = 'Available',
               updated_at = now()
         WHERE room_id = reservation_row.room_id
           AND status = 'Occupied';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_reservation_and_restore_inventory(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_reservation_and_restore_inventory(integer, text) TO authenticated;
