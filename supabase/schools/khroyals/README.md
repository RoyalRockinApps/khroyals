Kingdom Heights' own database changes (none yet): the shared migrations in
`supabase/migrations/` start out with its names and settings. A change for this school
only goes here as a new timestamped `.sql` file; `scripts/supabase_setup.mjs` applies it
once, after the shared migrations, to Kingdom Heights' project only.
