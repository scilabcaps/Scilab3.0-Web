-- Deduct reservation inventory in one authorized, atomic operation.
ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS inventory_deducted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.deduct_reservation_inventory(p_reservation_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    reservation_owner uuid;
    inventory_already_deducted boolean;
    caller_role text;
    asset_item record;
    chemical_item record;
BEGIN
    SELECT user_id, inventory_deducted
      INTO reservation_owner, inventory_already_deducted
      FROM public.reservations
     WHERE reservation_id = p_reservation_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found.' USING ERRCODE = 'P0002';
    END IF;

    IF inventory_already_deducted THEN
        RETURN;
    END IF;

    SELECT role
      INTO caller_role
      FROM public.user_info
     WHERE id = auth.uid();

    IF auth.uid() IS NULL
       OR (reservation_owner IS DISTINCT FROM auth.uid()
           AND caller_role NOT IN ('admin', 'librarian', 'professor')) THEN
        RAISE EXCEPTION 'You are not authorized to deduct this reservation inventory.'
            USING ERRCODE = '42501';
    END IF;

    FOR asset_item IN
        SELECT asset_id, SUM(quantity_borrowed)::integer AS quantity
          FROM public.reservation_items
         WHERE reservation_id = p_reservation_id
           AND COALESCE(is_deleted, false) = false
         GROUP BY asset_id
    LOOP
        UPDATE public.lab_assets
           SET available_stock = available_stock - asset_item.quantity,
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
           SET stock_quantity = stock_quantity - chemical_item.quantity,
               updated_at = now()
         WHERE chemical_id = chemical_item.chemical_id
           AND COALESCE(stock_quantity, 0) >= chemical_item.quantity;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient chemical stock for chemical %.', chemical_item.chemical_id
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    UPDATE public.reservations
       SET inventory_deducted = true,
           updated_at = now()
     WHERE reservation_id = p_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_reservation_inventory(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_reservation_inventory(integer) TO authenticated;
