-- Agencies must be able to manage the child rows they own through the client API.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_addons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_milestones TO authenticated;

-- Public clients use token-scoped RPCs below, not direct table access. The
-- original policies allowed anonymous users to read and update every proposal.
DROP POLICY IF EXISTS "Public can view proposal via token" ON public.proposals;
DROP POLICY IF EXISTS "Public can update proposal via token" ON public.proposals;
DROP POLICY IF EXISTS "Public can view addons" ON public.proposal_addons;
DROP POLICY IF EXISTS "Public can view milestones" ON public.proposal_milestones;
DROP POLICY IF EXISTS "Agencies can manage own proposal add-ons" ON public.proposal_addons;
DROP POLICY IF EXISTS "Agencies can manage own proposal milestones" ON public.proposal_milestones;

CREATE POLICY "Agencies can manage own proposal add-ons"
  ON public.proposal_addons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = proposal_addons.proposal_id
        AND proposals.agency_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = proposal_addons.proposal_id
        AND proposals.agency_id = auth.uid()
    )
  );

CREATE POLICY "Agencies can manage own proposal milestones"
  ON public.proposal_milestones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = proposal_milestones.proposal_id
        AND proposals.agency_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = proposal_milestones.proposal_id
        AND proposals.agency_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_proposal(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', p.id,
      'token', p.token,
      'title', p.title,
      'client_name', p.client_name,
      'client_company', p.client_company,
      'project_summary', p.project_summary,
      'base_price', p.base_price,
      'dp_percentage', p.dp_percentage,
      'status', p.status,
      'total_amount', p.total_amount,
      'dp_amount', p.dp_amount,
      'approved_at', p.approved_at,
      'created_at', p.created_at
    ),
    'addons', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.proposal_addons AS a
      WHERE a.proposal_id = p.id
    ), '[]'::jsonb),
    'milestones', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort_order, m.created_at)
      FROM public.proposal_milestones AS m
      WHERE m.proposal_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.proposals AS p
  WHERE p.token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_proposal(
  p_token uuid,
  p_response text,
  p_selected_addon_ids uuid[] DEFAULT '{}'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_response = 'APPROVED' THEN
    UPDATE public.proposal_addons AS a
    SET is_selected = a.is_required OR a.id = ANY(COALESCE(p_selected_addon_ids, '{}'::uuid[]))
    FROM public.proposals AS p
    WHERE p.token = p_token
      AND p.status = 'SENT'
      AND a.proposal_id = p.id;

    UPDATE public.proposals AS p
    SET status = 'APPROVED',
        total_amount = p.base_price + COALESCE((
          SELECT SUM(a.price)
          FROM public.proposal_addons AS a
          WHERE a.proposal_id = p.id
            AND a.is_selected = TRUE
        ), 0),
        dp_amount = (
          p.base_price + COALESCE((
            SELECT SUM(a.price)
            FROM public.proposal_addons AS a
            WHERE a.proposal_id = p.id
              AND a.is_selected = TRUE
          ), 0)
        ) * p.dp_percentage / 100,
        approved_at = NOW()
    WHERE p.token = p_token
      AND p.status = 'SENT';
  ELSIF p_response = 'REJECTED' THEN
    UPDATE public.proposals AS p
    SET status = 'REJECTED'
    WHERE p.token = p_token
      AND p.status = 'SENT';
  ELSE
    RAISE EXCEPTION 'Unsupported proposal response'
      USING ERRCODE = '22023';
  END IF;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_proposal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_proposal(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_proposal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_proposal(uuid, text, uuid[]) TO anon, authenticated;
