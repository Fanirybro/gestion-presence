BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
DECLARE
  view_sql text;
  view_owner text;
  view_options text[];
  view_comment text;
  grants_sql text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personnel' AND column_name = 'matricule') THEN
    RETURN;
  END IF;
  IF to_regclass('public.fiches_personnel') IS NOT NULL THEN
    SELECT pg_get_viewdef(c.oid, true), pg_get_userbyid(c.relowner), c.reloptions, obj_description(c.oid)
      INTO view_sql, view_owner, view_options, view_comment
      FROM pg_class c WHERE c.oid = 'public.fiches_personnel'::regclass;
    SELECT string_agg(format('GRANT %s ON public.fiches_personnel TO %s%s;', a.privilege_type,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END), E'
')
      INTO grants_sql FROM pg_class c, LATERAL aclexplode(c.relacl) a
      WHERE c.oid = 'public.fiches_personnel'::regclass;
    IF position('p.matricule,' in view_sql) = 0 THEN
      RAISE EXCEPTION 'Unexpected fiches_personnel definition; migration stopped';
    END IF;
    view_sql := replace(view_sql, 'p.matricule,', '');
    DROP VIEW public.fiches_personnel;
  END IF;
  ALTER TABLE public.personnel DROP COLUMN matricule;
  IF view_sql IS NOT NULL THEN
    EXECUTE 'CREATE VIEW public.fiches_personnel' ||
      CASE WHEN view_options IS NULL THEN '' ELSE ' WITH (' || array_to_string(view_options, ', ') || ')' END ||
      ' AS ' || view_sql;
    EXECUTE format('ALTER VIEW public.fiches_personnel OWNER TO %I', view_owner);
    IF grants_sql IS NOT NULL THEN EXECUTE grants_sql; END IF;
    EXECUTE format('COMMENT ON VIEW public.fiches_personnel IS %L', view_comment);
  END IF;
END $$;
COMMIT;
