-- Store a professor's user_info UUID for each student, with referential integrity.
DO $$
DECLARE
    professor_column_type text;
BEGIN
    SELECT data_type INTO professor_column_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_info'
      AND column_name = 'professor';

    IF professor_column_type IS NULL THEN
        ALTER TABLE public.user_info ADD COLUMN professor uuid;
    ELSIF professor_column_type <> 'uuid' THEN
        -- Convert names written by the earlier signup version when the match is unique.
        UPDATE public.user_info AS student
        SET professor = matched.professor_id::text
        FROM (
            SELECT student.id AS student_id, MIN(professor.id::text)::uuid AS professor_id
            FROM public.user_info AS student
            JOIN public.user_info AS professor
              ON concat_ws(' ', professor.first_name, professor.last_name) = student.professor
             AND professor.role = 'professor'
            WHERE NULLIF(BTRIM(student.professor), '') IS NOT NULL
            GROUP BY student.id
            HAVING COUNT(*) = 1
        ) AS matched
        WHERE student.id = matched.student_id;

        IF EXISTS (
            SELECT 1 FROM public.user_info
            WHERE NULLIF(BTRIM(professor), '') IS NOT NULL
              AND professor !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ) THEN
            RAISE EXCEPTION 'Could not uniquely match every existing user_info.professor value to a professor UUID';
        END IF;

        ALTER TABLE public.user_info
        ALTER COLUMN professor TYPE uuid
        USING NULLIF(BTRIM(professor), '')::uuid;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_info_professor_fkey'
          AND conrelid = 'public.user_info'::regclass
    ) THEN
        ALTER TABLE public.user_info
        ADD CONSTRAINT user_info_professor_fkey
        FOREIGN KEY (professor) REFERENCES public.user_info(id);
    END IF;
END $$;
