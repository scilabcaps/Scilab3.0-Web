-- Run both low-stock notification jobs every 15 minutes.

DO $$
DECLARE
    existing_job_id bigint;
BEGIN
    FOR existing_job_id IN
        SELECT jobid
        FROM cron.job
        WHERE jobname IN ('low_stock_chemical', 'low_stock_labAssets')
    LOOP
        PERFORM cron.unschedule(existing_job_id);
    END LOOP;

    PERFORM cron.schedule(
        'low_stock_chemical',
        '*/15 * * * *',
        'SELECT public.create_low_stock_notifications();'
    );

    PERFORM cron.schedule(
        'low_stock_labAssets',
        '*/15 * * * *',
        'SELECT public.create_low_stock_asset_notifications();'
    );
END;
$$;
