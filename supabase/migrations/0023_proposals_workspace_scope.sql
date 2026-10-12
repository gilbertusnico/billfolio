ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_agency_workspace_created_idx
  ON public.proposals (agency_id, company_id, created_at DESC);

-- Assign existing proposals only when their creator has exactly one workspace.
-- Proposals belonging to users with multiple workspaces remain unassigned,
-- since their original workspace cannot be inferred safely.
WITH user_workspaces AS (
  SELECT c.owner_id AS user_id, c.id AS company_id
  FROM public.companies AS c
  UNION
  SELECT cm.user_id, cm.company_id
  FROM public.company_members AS cm
),
unambiguous_workspaces AS (
  SELECT p.id AS proposal_id, MIN(uw.company_id::text)::uuid AS company_id
  FROM public.proposals AS p
  JOIN user_workspaces AS uw ON uw.user_id = p.agency_id
  WHERE p.company_id IS NULL
  GROUP BY p.id
  HAVING COUNT(DISTINCT uw.company_id) = 1
)
UPDATE public.proposals AS p
SET company_id = uw.company_id
FROM unambiguous_workspaces AS uw
WHERE p.id = uw.proposal_id;

DROP POLICY IF EXISTS "Agencies can manage own proposals" ON public.proposals;
CREATE POLICY "Agencies can manage own workspace proposals"
  ON public.proposals
  FOR ALL
  TO authenticated
  USING (
    agency_id = auth.uid()
    AND company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies AS c
      WHERE c.id = proposals.company_id
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  )
  WITH CHECK (
    agency_id = auth.uid()
    AND company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies AS c
      WHERE c.id = proposals.company_id
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  );

DROP POLICY IF EXISTS "Agencies can manage own proposal add-ons" ON public.proposal_addons;
CREATE POLICY "Agencies can manage own workspace proposal add-ons"
  ON public.proposal_addons
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposals AS p
      JOIN public.companies AS c ON c.id = p.company_id
      WHERE p.id = proposal_addons.proposal_id
        AND p.agency_id = auth.uid()
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposals AS p
      JOIN public.companies AS c ON c.id = p.company_id
      WHERE p.id = proposal_addons.proposal_id
        AND p.agency_id = auth.uid()
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  );

DROP POLICY IF EXISTS "Agencies can manage own proposal milestones" ON public.proposal_milestones;
CREATE POLICY "Agencies can manage own workspace proposal milestones"
  ON public.proposal_milestones
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposals AS p
      JOIN public.companies AS c ON c.id = p.company_id
      WHERE p.id = proposal_milestones.proposal_id
        AND p.agency_id = auth.uid()
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposals AS p
      JOIN public.companies AS c ON c.id = p.company_id
      WHERE p.id = proposal_milestones.proposal_id
        AND p.agency_id = auth.uid()
        AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
    )
  );
