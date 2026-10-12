ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS payment_bank_name text,
  ADD COLUMN IF NOT EXISTS payment_account_number text,
  ADD COLUMN IF NOT EXISTS payment_account_holder text,
  ADD COLUMN IF NOT EXISTS agency_whatsapp_number text;

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
      'created_at', p.created_at,
      'payment_bank_name', CASE WHEN p.status IN ('APPROVED', 'PAID') THEN p.payment_bank_name END,
      'payment_account_number', CASE WHEN p.status IN ('APPROVED', 'PAID') THEN p.payment_account_number END,
      'payment_account_holder', CASE WHEN p.status IN ('APPROVED', 'PAID') THEN p.payment_account_holder END,
      'agency_whatsapp_number', CASE WHEN p.status IN ('APPROVED', 'PAID') THEN p.agency_whatsapp_number END
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

CREATE OR REPLACE FUNCTION public.can_upload_proposal_signature(p_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposals AS p
    WHERE p.token = p_token
      AND p.status = 'SENT'
  );
$$;

REVOKE ALL ON FUNCTION public.can_upload_proposal_signature(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_proposal_signature(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read pending proposal signatures" ON storage.objects;
CREATE POLICY "Public can read pending proposal signatures"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND name ~ '^signatures/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/signature\.png$'
    AND CASE
      WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN public.can_upload_proposal_signature(split_part(name, '/', 2)::uuid)
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Public can upload proposal signatures" ON storage.objects;
CREATE POLICY "Public can upload proposal signatures"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'proposal-assets'
    AND name ~ '^signatures/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/signature\.png$'
    AND CASE
      WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN public.can_upload_proposal_signature(split_part(name, '/', 2)::uuid)
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Public can update proposal signatures" ON storage.objects;
CREATE POLICY "Public can update proposal signatures"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND name ~ '^signatures/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/signature\.png$'
    AND CASE
      WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN public.can_upload_proposal_signature(split_part(name, '/', 2)::uuid)
      ELSE FALSE
    END
  )
  WITH CHECK (
    bucket_id = 'proposal-assets'
    AND name ~ '^signatures/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/signature\.png$'
    AND CASE
      WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN public.can_upload_proposal_signature(split_part(name, '/', 2)::uuid)
      ELSE FALSE
    END
  );

DROP FUNCTION IF EXISTS public.respond_to_proposal(uuid, text, uuid[]);

CREATE OR REPLACE FUNCTION public.respond_to_proposal(
  p_token uuid,
  p_response text,
  p_selected_addon_ids uuid[],
  p_signature_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal_id uuid;
BEGIN
  SELECT p.id
  INTO proposal_id
  FROM public.proposals AS p
  WHERE p.token = p_token
    AND p.status = 'SENT'
  FOR UPDATE;

  IF proposal_id IS NULL THEN
    RETURN FALSE;
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
    WHERE a.proposal_id = proposal_id;

    UPDATE public.proposals AS p
    SET status = 'APPROVED',
        client_signature_url = p_signature_url,
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
    WHERE p.id = proposal_id;
  ELSIF p_response = 'REJECTED' THEN
    UPDATE public.proposals AS p
    SET status = 'REJECTED'
    WHERE p.id = proposal_id;
  ELSE
    RAISE EXCEPTION 'Unsupported proposal response'
      USING ERRCODE = '22023';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_proposal(uuid, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_proposal(uuid, text, uuid[], text) TO anon, authenticated;
