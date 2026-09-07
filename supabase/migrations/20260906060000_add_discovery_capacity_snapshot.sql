-- Aggregate catalog metadata only: no descriptions, private profiles or
-- credentials leave Postgres when checking storage consumption.
CREATE OR REPLACE FUNCTION public.get_discovery_capacity_snapshot()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'checkedAt',now(),
    'databaseBytes',pg_database_size(current_database()),
    'relations',coalesce((SELECT jsonb_agg(row_data ORDER BY bytes DESC) FROM (
      SELECT pg_total_relation_size(c.oid) AS bytes,
        jsonb_build_object('schema',n.nspname,'table',c.relname,
          'totalBytes',pg_total_relation_size(c.oid),
          'tableBytes',pg_table_size(c.oid),'indexBytes',pg_indexes_size(c.oid),
          'estimatedRows',greatest(c.reltuples,0)::bigint) AS row_data
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','m') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
      ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 25
    ) sizes),'[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_discovery_capacity_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_discovery_capacity_snapshot() TO service_role;
NOTIFY pgrst, 'reload schema';
