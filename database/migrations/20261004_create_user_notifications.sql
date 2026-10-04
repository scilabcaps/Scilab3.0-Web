-- Notifications for student and professor accounts.
-- The existing public.notifications table remains dedicated to admin alerts.

CREATE TABLE IF NOT EXISTS public.user_notifications (
    notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL DEFAULT 'general',
    reservation_id integer REFERENCES public.reservations(reservation_id) ON DELETE SET NULL,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_notifications_read_at_consistent
        CHECK ((is_read AND read_at IS NOT NULL) OR (NOT is_read AND read_at IS NULL))
);

CREATE INDEX IF NOT EXISTS user_notifications_recipient_created_idx
    ON public.user_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
    ON public.user_notifications (recipient_user_id, created_at DESC)
    WHERE is_read = false;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.user_notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.user_notifications TO authenticated;
REVOKE DELETE ON public.user_notifications FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can read their notifications" ON public.user_notifications;
CREATE POLICY "Users can read their notifications"
    ON public.user_notifications
    FOR SELECT
    TO authenticated
    USING (recipient_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create their own notifications" ON public.user_notifications;
CREATE POLICY "Users can create their own notifications"
    ON public.user_notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (recipient_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can mark their notifications read" ON public.user_notifications;
CREATE POLICY "Users can mark their notifications read"
    ON public.user_notifications
    FOR UPDATE
    TO authenticated
    USING (recipient_user_id = (SELECT auth.uid()))
    WITH CHECK (recipient_user_id = (SELECT auth.uid()));
