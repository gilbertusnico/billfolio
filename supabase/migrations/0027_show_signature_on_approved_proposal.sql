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
      'client_signature_path', CASE
        WHEN p.status = 'APPROVED' AND p.client_signature_url IS NOT NULL
        THEN 'signatures/' || p.token::text || '/signature.png'
        ELSE NULL
      END,
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

REVOKE ALL ON FUNCTION public.get_public_proposal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_proposal(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_read_approved_proposal_signature(p_token uuid)
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
      AND p.status = 'APPROVED'
      AND p.client_signature_url IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_approved_proposal_signature(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_approved_proposal_signature(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read approved proposal signatures via DP invoice" ON storage.objects;
DROP POLICY IF EXISTS "Public can read approved proposal signatures" ON storage.objects;
CREATE POLICY "Public can read approved proposal signatures"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'proposal-assets'
    AND name ~ '^signatures/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/signature\.png$'
    AND CASE
      WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN public.can_read_approved_proposal_signature(split_part(name, '/', 2)::uuid)
      ELSE FALSE
    END
  );

CREATE OR REPLACE FUNCTION public.get_public_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'number', i.number,
      'client_id', i.client_id,
      'client_snapshot', i.client_snapshot,
      'project_name', coalesce(i.project_name, ''),
      'invoice_date', i.invoice_date,
      'due_date', i.due_date,
      'tax_rate', i.tax_rate,
      'discount', i.discount,
      'subtotal', i.subtotal,
      'tax_amount', i.tax_amount,
      'grand_total', i.grand_total,
      'paid_at', i.paid_at,
      'bank_account_id', i.bank_account_id,
      'bank_snapshot', i.bank_snapshot,
      'notes', coalesce(i.notes, ''),
      'status', i.status,
      'items', i.items,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ),
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'email', coalesce(c.email, ''),
      'address', coalesce(c.address, ''),
      'logo_url', coalesce(c.logo_url, ''),
      'currency', coalesce(c.currency, 'USD'),
      'styling', coalesce(c.styling, '{}'::jsonb)
    )
  )
  INTO v_out
  FROM public.invoices AS i
  JOIN public.companies AS c ON c.id = i.company_id
  WHERE i.id = p_invoice_id
    AND c.deleted_at IS NULL;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated;
