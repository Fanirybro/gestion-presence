-- ==============================================================================
-- Migration: Row Level Security (RLS) & Multi-Tenant Cloisonnement par Division
-- ==============================================================================

-- 1. Helper function dans public pour extraire le division_id du JWT Supabase ou session
CREATE OR REPLACE FUNCTION public.current_division_id() 
RETURNS bigint AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'division_id', '')::bigint,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'division_id', '')::bigint,
    NULLIF(current_setting('app.current_division_id', true), '')::bigint
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Activation de RLS sur les tables sensibles
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences_journalieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pointages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences_autorisees ENABLE ROW LEVEL SECURITY;

-- 3. Politiques RLS pour divisions
DROP POLICY IF EXISTS "Division isolation: select" ON public.divisions;
CREATE POLICY "Division isolation: select" ON public.divisions
  FOR SELECT USING (
    public.current_division_id() IS NULL -- Permet aux superadmins/service_role de bypasser
    OR id = public.current_division_id()
  );

-- 4. Politiques RLS pour personnel
DROP POLICY IF EXISTS "Personnel isolation: all" ON public.personnel;
CREATE POLICY "Personnel isolation: all" ON public.personnel
  FOR ALL USING (
    public.current_division_id() IS NULL
    OR division_id = public.current_division_id()
  ) WITH CHECK (
    public.current_division_id() IS NULL
    OR division_id = public.current_division_id()
  );

-- 5. Politiques RLS pour presences_journalieres
DROP POLICY IF EXISTS "Presences isolation: all" ON public.presences_journalieres;
CREATE POLICY "Presences isolation: all" ON public.presences_journalieres
  FOR ALL USING (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  ) WITH CHECK (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  );

-- 6. Politiques RLS pour pointages
DROP POLICY IF EXISTS "Pointages isolation: all" ON public.pointages;
CREATE POLICY "Pointages isolation: all" ON public.pointages
  FOR ALL USING (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  ) WITH CHECK (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  );

-- 7. Politiques RLS pour absences_autorisees
DROP POLICY IF EXISTS "Absences isolation: all" ON public.absences_autorisees;
CREATE POLICY "Absences isolation: all" ON public.absences_autorisees
  FOR ALL USING (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  ) WITH CHECK (
    public.current_division_id() IS NULL
    OR personnel_id IN (SELECT id FROM public.personnel WHERE division_id = public.current_division_id())
  );
