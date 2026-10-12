ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dp_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS proposals_dp_invoice_id_key
  ON public.proposals (dp_invoice_id)
  WHERE dp_invoice_id IS NOT NULL;

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
      'dp_invoice_id', p.dp_invoice_id,
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

CREATE OR REPLACE FUNCTION public._create_proposal_dp_invoice(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_bank public.bank_accounts%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_client_count integer;
  v_bank_count integer;
  v_sequence integer;
  v_prefix text;
  v_company_code text;
  v_invoice_number text;
  v_invoice_id uuid;
  v_due_date date;
  v_items jsonb;
  v_client_snapshot jsonb;
  v_bank_snapshot jsonb;
BEGIN
  SELECT *
  INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF v_proposal.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Proposal must be approved before its DP invoice can be created';
  END IF;

  IF v_proposal.dp_invoice_id IS NOT NULL THEN
    RETURN v_proposal.dp_invoice_id;
  END IF;

  IF v_proposal.company_id IS NULL THEN
    RAISE EXCEPTION 'This proposal is not assigned to a workspace';
  END IF;

  SELECT *
  INTO v_company
  FROM public.companies
  WHERE id = v_proposal.company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The proposal workspace is unavailable';
  END IF;

  IF v_proposal.client_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM public.clients
    WHERE id = v_proposal.client_id
      AND company_id = v_proposal.company_id;
    IF NOT FOUND THEN
      v_proposal.client_id := NULL;
    END IF;
  END IF;

  IF v_proposal.client_id IS NULL AND NULLIF(trim(v_proposal.client_email), '') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_client_count
    FROM public.clients
    WHERE company_id = v_proposal.company_id
      AND lower(trim(email)) = lower(trim(v_proposal.client_email));

    IF v_client_count = 1 THEN
      SELECT *
      INTO v_client
      FROM public.clients
      WHERE company_id = v_proposal.company_id
        AND lower(trim(email)) = lower(trim(v_proposal.client_email))
      LIMIT 1;
      v_proposal.client_id := v_client.id;
    END IF;
  END IF;

  IF NULLIF(trim(v_proposal.payment_bank_name), '') IS NULL
    OR NULLIF(trim(v_proposal.payment_account_number), '') IS NULL
    OR NULLIF(trim(v_proposal.payment_account_holder), '') IS NULL
  THEN
    IF v_proposal.payment_bank_account_id IS NOT NULL THEN
      SELECT *
      INTO v_bank
      FROM public.bank_accounts
      WHERE id = v_proposal.payment_bank_account_id
        AND company_id = v_proposal.company_id;
    END IF;

    IF v_bank.id IS NULL THEN
      SELECT COUNT(*)
      INTO v_bank_count
      FROM public.bank_accounts
      WHERE company_id = v_proposal.company_id;

      IF v_bank_count = 1 THEN
        SELECT *
        INTO v_bank
        FROM public.bank_accounts
        WHERE company_id = v_proposal.company_id
        LIMIT 1;
      ELSE
        RAISE EXCEPTION
          'Add a payment bank account to this proposal workspace before the client approves it';
      END IF;
    END IF;

    v_proposal.payment_bank_account_id := v_bank.id;
    v_proposal.payment_bank_name := v_bank.name;
    v_proposal.payment_account_number := v_bank.account_number;
    v_proposal.payment_account_holder := v_bank.holder;
  END IF;

  v_sequence := greatest(
    0,
    coalesce(nullif(v_company.styling #>> '{settings,lastSequence}', '')::integer, 0)
  ) + 1;
  v_prefix := regexp_replace(
    coalesce(nullif(v_company.styling #>> '{settings,invoicePrefix}', ''), 'INV'),
    '[[:space:]/]+',
    '',
    'g'
  );
  v_prefix := regexp_replace(v_prefix, '[-_]+$', '');
  IF v_prefix = '' THEN
    v_prefix := 'INV';
  END IF;

  v_company_code := upper(
    left(regexp_replace(v_company.name, '[^A-Za-z]', '', 'g'), 4)
  );
  IF v_company_code = '' THEN
    v_company_code := upper(left(regexp_replace(v_company.name, '[^A-Za-z0-9]', '', 'g'), 4));
  END IF;
  IF v_company_code = '' THEN
    v_company_code := 'COMP';
  END IF;
  LOOP
    v_invoice_number := v_prefix || '/' || v_company_code || '/' || lpad(v_sequence::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.invoices
      WHERE company_id = v_proposal.company_id
        AND number = v_invoice_number
    );
    v_sequence := v_sequence + 1;
  END LOOP;

  v_due_date := coalesce(v_proposal.approved_at::date, current_date) + 14;
  v_items := jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'description', 'DP ' || v_proposal.title || ' (' || v_proposal.dp_percentage || '%)',
      'quantity', 1,
      'unitPrice', v_proposal.dp_amount
    )
  );
  v_client_snapshot := jsonb_build_object(
    'name', v_proposal.client_name,
    'company', v_proposal.client_company,
    'email', v_proposal.client_email,
    'phone', v_proposal.client_whatsapp,
    'address', coalesce(v_client.address, '')
  );
  v_bank_snapshot := jsonb_build_object(
    'name', v_proposal.payment_bank_name,
    'accountNumber', v_proposal.payment_account_number,
    'holder', v_proposal.payment_account_holder
  );

  v_invoice_id := gen_random_uuid();
  INSERT INTO public.invoices (
    id,
    company_id,
    number,
    client_id,
    client_snapshot,
    project_name,
    invoice_date,
    due_date,
    tax_rate,
    discount,
    bank_account_id,
    bank_snapshot,
    notes,
    status,
    items,
    paid_at,
    payment_reported_at,
    share_link_generated_at
  )
  VALUES (
    v_invoice_id,
    v_proposal.company_id,
    v_invoice_number,
    v_proposal.client_id,
    v_client_snapshot,
    v_proposal.title,
    coalesce(v_proposal.approved_at::date, current_date),
    v_due_date,
    0,
    0,
    v_proposal.payment_bank_account_id,
    v_bank_snapshot,
    '',
    'PENDING',
    v_items,
    NULL,
    NULL,
    now()
  );

  UPDATE public.companies
  SET styling = jsonb_set(
    coalesce(styling, '{}'::jsonb),
    '{settings}',
    coalesce(styling->'settings', '{}'::jsonb) || jsonb_build_object('lastSequence', v_sequence),
    true
  ),
  updated_at = now()
  WHERE id = v_proposal.company_id;

  UPDATE public.proposals
  SET client_id = v_proposal.client_id,
      payment_bank_account_id = v_proposal.payment_bank_account_id,
      payment_bank_name = v_proposal.payment_bank_name,
      payment_account_number = v_proposal.payment_account_number,
      payment_account_holder = v_proposal.payment_account_holder,
      dp_invoice_id = v_invoice_id,
      updated_at = now()
  WHERE id = v_proposal.id;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_proposal_dp_invoice(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
BEGIN
  SELECT id
  INTO v_proposal_id
  FROM public.proposals
  WHERE token = p_token
    AND status = 'APPROVED';

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'No approved proposal was found for this link';
  END IF;

  RETURN public._create_proposal_dp_invoice(v_proposal_id);
END;
$$;

DROP FUNCTION IF EXISTS public.respond_to_proposal(uuid, text, uuid[], text);
CREATE FUNCTION public.respond_to_proposal(
  p_token uuid,
  p_response text,
  p_selected_addon_ids uuid[],
  p_signature_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_invoice_id uuid;
  v_total_amount numeric;
BEGIN
  SELECT *
  INTO v_proposal
  FROM public.proposals
  WHERE token = p_token
    AND status = 'SENT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'invoice_id', NULL);
  END IF;

  IF p_response = 'APPROVED' THEN
    IF p_signature_url IS NULL
      OR p_signature_url !~ ('/proposal-assets/signatures/' || p_token::text || '/signature\.png$')
    THEN
      RAISE EXCEPTION 'A valid proposal signature is required'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.proposal_addons AS a
    SET is_selected = a.is_required OR a.id = ANY(COALESCE(p_selected_addon_ids, '{}'::uuid[]))
    WHERE a.proposal_id = v_proposal.id;

    SELECT v_proposal.base_price + coalesce(sum(a.price), 0)
    INTO v_total_amount
    FROM public.proposal_addons AS a
    WHERE a.proposal_id = v_proposal.id
      AND a.is_selected = TRUE;

    UPDATE public.proposals
    SET status = 'APPROVED',
        client_signature_url = p_signature_url,
        total_amount = v_total_amount,
        dp_amount = v_total_amount * dp_percentage / 100,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_proposal.id;

    v_invoice_id := public._create_proposal_dp_invoice(v_proposal.id);
  ELSIF p_response = 'REJECTED' THEN
    UPDATE public.proposals
    SET status = 'REJECTED',
        updated_at = now()
    WHERE id = v_proposal.id;
  ELSE
    RAISE EXCEPTION 'Unsupported proposal response'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public._create_proposal_dp_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_proposal_dp_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_proposal(uuid, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_proposal_dp_invoice(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_proposal(uuid, text, uuid[], text) TO anon, authenticated;
