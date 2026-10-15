-- Supports fast professor pending-approval lookups and live approval refreshes.
create index if not exists idx_reservations_professor_pending_created_at
    on public.reservations (professor, professor_approval, created_at desc);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'reservations'
    ) then
        alter publication supabase_realtime add table public.reservations;
    end if;
end
$$;
