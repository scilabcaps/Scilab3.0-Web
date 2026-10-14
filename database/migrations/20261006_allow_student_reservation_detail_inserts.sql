-- Allow students to add details only to reservations they own.
CREATE POLICY "Students create own reservation items"
    ON public.reservation_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.reservations
             WHERE reservations.reservation_id = reservation_items.reservation_id
               AND reservations.user_id = auth.uid()
        )
    );

CREATE POLICY "Students create own chemical usage"
    ON public.chemical_usage
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.reservations
             WHERE reservations.reservation_id = chemical_usage.reservation_id
               AND reservations.user_id = auth.uid()
        )
    );
