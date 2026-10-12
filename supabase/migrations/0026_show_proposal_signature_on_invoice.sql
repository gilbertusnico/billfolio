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
      AND p.dp_invoice_id IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_approved_proposal_signature(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_approved_proposal_signature(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read approved proposal signatures via DP invoice" ON storage.objects;
CREATE POLICY "Public can read approved proposal signatures via DP invoice"
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
      'updated_at', i.updated_at,
      'proposal_signature_path', (
        SELECT 'signatures/' || p.token::text || '/signature.png'
        FROM public.proposals AS p
        WHERE p.dp_invoice_id = i.id
          AND p.status = 'APPROVED'
        LIMIT 1
      )
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
