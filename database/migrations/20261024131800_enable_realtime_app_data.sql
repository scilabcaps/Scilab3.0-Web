-- Enable live change events for tables used by reservation, inventory,
-- announcement, and notification views. Existing RLS policies continue to
-- control which rows authenticated clients can receive.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'reservation_items',
        'chemical_usage',
        'rooms',
        'lab_assets',
        'chemicals',
        'announcement',
        'user_notifications'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = table_name
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
        END IF;
    END LOOP;
END;
$$;
