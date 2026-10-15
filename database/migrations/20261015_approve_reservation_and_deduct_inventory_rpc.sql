-- Approve a reservation and deduct its inventory in one atomic operation.
-- The admin/librarian client should call this RPC instead of updating
-- reservations.admin_approval directly.

CREATE OR REPLACE FUNCTION public.approve_reservation_and_deduct_inventory(
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
    asset_item record;
    chemical_item record;
BEGIN
    caller_role := public.current_user_role();

    IF auth.uid() IS NULL
       OR caller_role NOT IN ('admin', 'librarian') THEN
        RAISE EXCEPTION 'Only authenticated administrators or librarians can approve reservations.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO reservation_row
      FROM public.reservations
     WHERE reservation_id = p_reservation_id
       AND COALESCE(is_deleted, false) = false
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF reservation_row.admin_approval <> 'Pending' THEN
        RAISE EXCEPTION 'Reservation is no longer pending admin approval.'
            USING ERRCODE = 'P0001';
    END IF;

    IF reservation_row.professor_approval <> 'Approved' THEN
        RAISE EXCEPTION 'Reservation must be approved by a professor first.'
            USING ERRCODE = 'P0001';
    END IF;

    IF reservation_row.inventory_deducted THEN
        RAISE EXCEPTION 'Reservation inventory has already been deducted.'
            USING ERRCODE = 'P0001';
    END IF;

    FOR asset_item IN
        SELECT asset_id, SUM(quantity_borrowed)::integer AS quantity
          FROM public.reservation_items
         WHERE reservation_id = p_reservation_id
           AND COALESCE(is_deleted, false) = false
         GROUP BY asset_id
    LOOP
        UPDATE public.lab_assets
           SET available_stock = COALESCE(available_stock, 0) - asset_item.quantity,
               updated_at = now()
         WHERE asset_id = asset_item.asset_id
           AND COALESCE(available_stock, 0) >= asset_item.quantity;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient asset stock for asset %.', asset_item.asset_id
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    FOR chemical_item IN
        SELECT chemical_id, SUM(quantity_used) AS quantity
          FROM public.chemical_usage
         WHERE reservation_id = p_reservation_id
           AND COALESCE(is_deleted, false) = false
         GROUP BY chemical_id
    LOOP
        UPDATE public.chemicals
           SET stock_quantity = COALESCE(stock_quantity, 0) - chemical_item.quantity,
               updated_at = now()
         WHERE chemical_id = chemical_item.chemical_id
           AND COALESCE(stock_quantity, 0) >= chemical_item.quantity;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient chemical stock for chemical %.', chemical_item.chemical_id
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    UPDATE public.reservations
       SET admin_approval = 'Approved',
           status = 'Approved',
           inventory_deducted = true,
           updated_at = now()
     WHERE reservation_id = p_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_reservation_and_deduct_inventory(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_reservation_and_deduct_inventory(integer) TO authenticated;
