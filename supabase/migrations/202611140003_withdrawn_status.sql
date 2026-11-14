-- Kept in its own migration: PostgreSQL must commit an enum addition before use.
alter type public.incident_status add value if not exists 'withdrawn';
