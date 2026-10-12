CREATE OR REPLACE FUNCTION public.update_proposal(
  p_proposal_id uuid,
  p_agency_id uuid,
  p_workspace_id uuid,
  p_payload jsonb,
  p_addons jsonb,
  p_milestones jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_client_id uuid;
  v_bank_id uuid;
  v_base_price numeric;
  v_dp_percentage integer;
  v_total numeric;
  v_addon jsonb;
  v_milestone jsonb;
  v_sort_order integer := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_agency_id THEN
    RAISE EXCEPTION 'Not authorized to edit this proposal'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND agency_id = p_agency_id
    AND company_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found in this workspace';
  END IF;

  IF v_proposal.status IN ('APPROVED', 'PAID') OR v_proposal.dp_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Approved proposals can no longer be edited';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies AS c
    WHERE c.id = p_workspace_id
      AND c.deleted_at IS NULL
      AND (c.owner_id = auth.uid() OR public.is_company_member(c.id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit proposals in this workspace'
      USING ERRCODE = '42501';
  END IF;

  IF nullif(trim(p_payload->>'title'), '') IS NULL THEN
    RAISE EXCEPTION 'Project title is required'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_addons) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_milestones) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Add-ons and milestones must be arrays'
      USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(p_payload->>'client_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Client name is required'
      USING ERRCODE = '22023';
  END IF;

  v_client_id := nullif(p_payload->>'client_id', '')::uuid;
  v_bank_id := nullif(p_payload->>'payment_bank_account_id', '')::uuid;
  v_base_price := (p_payload->>'base_price')::numeric;
  v_dp_percentage := (p_payload->>'dp_percentage')::integer;

  IF v_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_client_id AND company_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Select a client from this workspace'
      USING ERRCODE = '22023';
  END IF;
  IF v_bank_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bank_accounts
    WHERE id = v_bank_id AND company_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Select a bank account from this workspace'
      USING ERRCODE = '22023';
  END IF;
  IF v_base_price IS NULL
    OR v_dp_percentage IS NULL
    OR v_base_price < 0
    OR v_dp_percentage < 1
    OR v_dp_percentage > 100
  THEN
    RAISE EXCEPTION 'Invalid base price or down-payment percentage'
      USING ERRCODE = '22023';
  END IF;

  v_total := v_base_price;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(p_addons)
  LOOP
    IF nullif(trim(v_addon->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'Add-on title is required'
        USING ERRCODE = '22023';
    END IF;
    IF (v_addon->>'price') IS NULL OR (v_addon->>'price')::numeric < 0 THEN
      RAISE EXCEPTION 'Add-on price must be a valid non-negative amount'
        USING ERRCODE = '22023';
    END IF;
    IF coalesce((v_addon->>'is_required')::boolean, false) THEN
      v_total := v_total + greatest(0, (v_addon->>'price')::numeric);
    END IF;
  END LOOP;

  UPDATE public.proposals
  SET client_id = v_client_id,
      title = trim(p_payload->>'title'),
      client_name = trim(p_payload->>'client_name'),
      client_company = nullif(trim(p_payload->>'client_company'), ''),
      client_email = trim(coalesce(p_payload->>'client_email', '')),
      project_summary = nullif(trim(p_payload->>'project_summary'), ''),
      base_price = v_base_price,
      dp_percentage = v_dp_percentage,
      payment_bank_account_id = v_bank_id,
      payment_bank_name = p_payload->>'payment_bank_name',
      payment_account_number = p_payload->>'payment_account_number',
      payment_account_holder = p_payload->>'payment_account_holder',
      agency_whatsapp_number = p_payload->>'agency_whatsapp_number',
      total_amount = v_total,
      dp_amount = v_total * v_dp_percentage / 100,
      updated_at = now()
  WHERE id = p_proposal_id;

  DELETE FROM public.proposal_addons WHERE proposal_id = p_proposal_id;
  FOR v_addon IN SELECT value FROM jsonb_array_elements(p_addons)
  LOOP
    INSERT INTO public.proposal_addons (
      proposal_id, title, description, price, is_required, is_selected
    )
    VALUES (
      p_proposal_id,
      trim(v_addon->>'title'),
      nullif(trim(v_addon->>'description'), ''),
      greatest(0, (v_addon->>'price')::numeric),
      coalesce((v_addon->>'is_required')::boolean, false),
      coalesce((v_addon->>'is_required')::boolean, false)
    );
  END LOOP;

  DELETE FROM public.proposal_milestones WHERE proposal_id = p_proposal_id;
  FOR v_milestone IN SELECT value FROM jsonb_array_elements(p_milestones)
  LOOP
    IF nullif(trim(v_milestone->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'Milestone title is required'
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.proposal_milestones (proposal_id, title, description, sort_order)
    VALUES (
      p_proposal_id,
      trim(v_milestone->>'title'),
      nullif(trim(v_milestone->>'description'), ''),
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_proposal(uuid, uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal(uuid, uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
