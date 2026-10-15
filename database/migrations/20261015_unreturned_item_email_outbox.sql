-- Queue professional professor emails for overdue student items.
-- The reservation ID is retained only for deduplication and is never rendered in email content.

CREATE TABLE IF NOT EXISTS public.unreturned_item_email_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_email text NOT NULL,
    recipient_name text,
    student_name text NOT NULL,
    student_year_section text,
    student_course text,
    student_email text,
    reservation_date date NOT NULL,
    end_time time NOT NULL,
    items jsonb NOT NULL,
    reservation_id integer NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'unreturned_items_professor_email',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    locked_at timestamptz,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unreturned_item_email_dedupe_idx
    ON public.unreturned_item_email_outbox (recipient_email, reservation_id, type);

CREATE INDEX IF NOT EXISTS unreturned_item_email_pending_idx
    ON public.unreturned_item_email_outbox (status, created_at)
    WHERE status IN ('pending', 'failed');

ALTER TABLE public.unreturned_item_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_unreturned_item_email(p_limit integer DEFAULT 25)
RETURNS TABLE (
    id bigint,
    recipient_email text,
    recipient_name text,
    student_name text,
    student_year_section text,
    student_course text,
    student_email text,
    reservation_date date,
    end_time time,
    items jsonb,
    attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT o.id
        FROM public.unreturned_item_email_outbox AS o
        WHERE o.status IN ('pending', 'failed')
          AND o.attempts < 5
          AND (o.locked_at IS NULL OR o.locked_at < now() - interval '15 minutes')
        ORDER BY o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT greatest(coalesce(p_limit, 25), 1)
    )
    UPDATE public.unreturned_item_email_outbox AS o
       SET status = 'processing', attempts = o.attempts + 1, locked_at = now(), last_error = NULL
      FROM claimed
     WHERE o.id = claimed.id
    RETURNING o.id, o.recipient_email, o.recipient_name, o.student_name,
              o.student_year_section, o.student_course, o.student_email,
              o.reservation_date, o.end_time, o.items, o.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_unreturned_item_email(p_outbox_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.unreturned_item_email_outbox
       SET status = 'sent', sent_at = now(), locked_at = NULL
     WHERE id = p_outbox_id AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_unreturned_item_email(p_outbox_id bigint, p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.unreturned_item_email_outbox
       SET status = 'failed', last_error = p_error, locked_at = NULL
     WHERE id = p_outbox_id AND status = 'processing';
$$;

REVOKE ALL ON FUNCTION public.claim_unreturned_item_email(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_unreturned_item_email(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_unreturned_item_email(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_unreturned_item_email(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_unreturned_item_email(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_unreturned_item_email(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_unreturned_item_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count integer;
BEGIN
    WITH overdue_reservations AS (
        SELECT
            r.reservation_id,
            r.user_id,
            r.reservation_date,
            r.end_time,
            r.professor AS reservation_professor,
            owner.role AS owner_role,
            owner.first_name,
            owner.last_name,
            owner.email AS student_email,
            owner.year_section AS student_year_section,
            owner.course AS student_course,
            owner.professor::text AS assigned_professor,
            professor.id AS professor_id,
            professor.first_name AS professor_first_name,
            professor.last_name AS professor_last_name,
            professor.email AS professor_email
        FROM public.reservations AS r
        JOIN public.user_info AS owner ON owner.id = r.user_id
        LEFT JOIN LATERAL (
            SELECT p.id, p.first_name, p.last_name, p.email
            FROM public.user_info AS p
            WHERE owner.role = 'student'
              AND p.role = 'professor'
              AND (
                    p.id::text = owner.professor::text
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(r.professor), '')
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(owner.professor::text), '')
              )
            ORDER BY CASE
                WHEN p.id::text = owner.professor::text THEN 0
                WHEN concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(r.professor), '') THEN 1
                ELSE 2
            END
            LIMIT 1
        ) AS professor ON true
        WHERE r.is_deleted = false
          AND r.reservation_date + r.end_time < (now() AT TIME ZONE 'Asia/Manila')
          AND r.status IN ('Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed')
          AND owner.role = 'student'
          AND EXISTS (
              SELECT 1 FROM public.reservation_items AS item
              WHERE item.reservation_id = r.reservation_id
                AND item.is_deleted = false
                AND item.is_returned = false
                AND item.quantity_returned < item.quantity_borrowed
          )
    ), notification_rows AS (
        SELECT reservation_id, user_id AS recipient_user_id,
               'unreturned_items_owner'::text AS notification_type,
               'Unreturned items reminder'::text AS notification_title,
               'Your reservation still has items to return.'::text AS notification_message
        FROM overdue_reservations
        UNION
        SELECT reservation_id, professor_id, 'unreturned_items_student'::text,
               'Student has unreturned items'::text,
               concat_ws(' ', first_name, last_name) || ' has unreturned item(s) for an overdue reservation.'
        FROM overdue_reservations
        WHERE professor_id IS NOT NULL
    )
    INSERT INTO public.user_notifications (recipient_user_id, title, message, type, reservation_id)
    SELECT recipient_user_id, notification_title, notification_message, notification_type, reservation_id
    FROM notification_rows
    ON CONFLICT DO NOTHING;

    WITH overdue_reservations AS (
        SELECT
            r.reservation_id,
            r.reservation_date,
            r.end_time,
            owner.first_name,
            owner.last_name,
            owner.email AS student_email,
            owner.year_section AS student_year_section,
            owner.course AS student_course,
            professor.first_name AS professor_first_name,
            professor.last_name AS professor_last_name,
            professor.email AS professor_email
        FROM public.reservations AS r
        JOIN public.user_info AS owner ON owner.id = r.user_id
        JOIN LATERAL (
            SELECT p.first_name, p.last_name, p.email
            FROM public.user_info AS p
            WHERE owner.role = 'student'
              AND p.role = 'professor'
              AND (
                    p.id::text = owner.professor::text
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(r.professor), '')
                    OR concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(owner.professor::text), '')
              )
            ORDER BY CASE
                WHEN p.id::text = owner.professor::text THEN 0
                WHEN concat_ws(' ', p.first_name, p.last_name) = NULLIF(BTRIM(r.professor), '') THEN 1
                ELSE 2
            END
            LIMIT 1
        ) AS professor ON true
        WHERE r.is_deleted = false
          AND r.reservation_date + r.end_time < (now() AT TIME ZONE 'Asia/Manila')
          AND r.status IN ('Approved', 'Ongoing', 'Partially Returned', 'Unreturned', 'Completed')
          AND owner.role = 'student'
    )
    INSERT INTO public.unreturned_item_email_outbox (
        recipient_email, recipient_name, student_name, student_year_section,
        student_course, student_email, reservation_date, end_time, items, reservation_id
    )
    SELECT
        o.professor_email,
        NULLIF(concat_ws(' ', o.professor_first_name, o.professor_last_name), ''),
        NULLIF(concat_ws(' ', o.first_name, o.last_name), ''),
        o.student_year_section,
        o.student_course,
        o.student_email,
        o.reservation_date,
        o.end_time,
        jsonb_agg(jsonb_build_object(
            'name', a.item_name,
            'category', a.category,
            'borrowed', item.quantity_borrowed,
            'returned', item.quantity_returned,
            'outstanding', greatest(item.quantity_borrowed - item.quantity_returned, 0)
        ) ORDER BY a.item_name),
        o.reservation_id
    FROM overdue_reservations AS o
    JOIN public.reservation_items AS item ON item.reservation_id = o.reservation_id
    JOIN public.lab_assets AS a ON a.asset_id = item.asset_id
    WHERE o.professor_email IS NOT NULL
      AND item.is_deleted = false
      AND item.is_returned = false
      AND item.quantity_returned < item.quantity_borrowed
    GROUP BY o.professor_email, o.professor_first_name, o.professor_last_name,
             o.first_name, o.last_name, o.student_year_section, o.student_course,
             o.student_email, o.reservation_date, o.end_time, o.reservation_id
    ON CONFLICT (recipient_email, reservation_id, type) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_unreturned_item_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_unreturned_item_notifications() TO postgres;
