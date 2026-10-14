-- Phase 2 RLS hardening for announcements and audit logs.
ALTER TABLE public.announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users view published announcements" ON public.announcement;
CREATE POLICY "Authenticated users view published announcements"
    ON public.announcement
    FOR SELECT
    TO authenticated
    USING (
        is_published = true
        AND publish_at <= now()
        AND (expires_at IS NULL OR expires_at >= now())
    );

DROP POLICY IF EXISTS "Admins and librarians manage announcements" ON public.announcement;
CREATE POLICY "Admins and librarians manage announcements"
    ON public.announcement
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.user_info
             WHERE user_info.id = auth.uid()
               AND user_info.role IN ('admin', 'librarian')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.user_info
             WHERE user_info.id = auth.uid()
               AND user_info.role IN ('admin', 'librarian')
        )
    );

DROP POLICY IF EXISTS "Admins and librarians read audit logs" ON public.audit_logs;
CREATE POLICY "Admins and librarians read audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.user_info
             WHERE user_info.id = auth.uid()
               AND user_info.role IN ('admin', 'librarian')
        )
    );

DROP POLICY IF EXISTS "Authenticated users create own audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users create own audit logs"
    ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
