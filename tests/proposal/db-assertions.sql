-- =====================================================================
-- SIT DB Assertions — Fitur Proposals (ProposalFolio)
-- Jalankan di Supabase SQL Editor sebagai service_role / superuser.
-- Ganti :token / :proposal_id / :workspace_id / :agency_id sesuai fixture.
-- Setiap query punya komentar EXPECTED agar bisa PASS/FAIL saat eksekusi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A-01 (PB-02): Total & DP benar saat create: hanya addon REQUIRED yang masuk total
-- EXPECTED: row tunggal; total_amount = base + Σ(required); dp_amount = total * pct/100
-- ---------------------------------------------------------------------
SELECT p.id, p.status, p.base_price, p.dp_percentage, p.total_amount, p.dp_amount,
       p.base_price + COALESCE((SELECT SUM(a.price) FROM proposal_addons a
                                WHERE a.proposal_id = p.id AND a.is_required), 0) AS expected_total,
       ROUND((p.base_price + COALESCE((SELECT SUM(a.price) FROM proposal_addons a
                                WHERE a.proposal_id = p.id AND a.is_required), 0))
             * p.dp_percentage / 100.0, 2) AS expected_dp
FROM proposals p
WHERE p.token = :token;

-- ---------------------------------------------------------------------
-- A-02 (PB-03): Addon required wajib is_selected=true, optional false sebelum approve
-- EXPECTED: 0 violation rows
-- ---------------------------------------------------------------------
SELECT a.id, a.title, a.is_required, a.is_selected
FROM proposal_addons a
JOIN proposals p ON p.id = a.proposal_id
WHERE p.token = :token
  AND p.status IN ('DRAFT','SENT')
  AND a.is_selected IS DISTINCT FROM a.is_required;

-- ---------------------------------------------------------------------
-- A-03 (PB-04): Milestone sort_order contiguous 0..n-1
-- EXPECTED: violations = 0
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS violations
FROM (
  SELECT m.sort_order, ROW_NUMBER() OVER (ORDER BY m.sort_order) - 1 AS expected
  FROM proposal_milestones m JOIN proposals p ON p.id = m.proposal_id
  WHERE p.token = :token
) t WHERE sort_order <> expected;

-- ---------------------------------------------------------------------
-- A-04 (PB-13 / DEF-07): Tidak ada proposal yatim tanpa addons/milestones
--        padahal dibuat dengan addons (deteksi rollback gagal)
-- EXPECTED: 0 rows
-- ---------------------------------------------------------------------
SELECT p.id, p.token, p.created_at
FROM proposals p
WHERE p.company_id = :workspace_id
  AND p.created_at > now() - interval '1 day'
  AND NOT EXISTS (SELECT 1 FROM proposal_addons a WHERE a.proposal_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM proposal_milestones m WHERE m.proposal_id = p.id)
  AND p.project_summary IS NOT NULL; -- heuristik: proposal 'kosong penuh' mencurigakan

-- ---------------------------------------------------------------------
-- A-05 (PD-06): Mark sent hanya transisi DRAFT -> SENT
-- EXPECTED setelah aksi: status='SENT'; cek guard: update dgn status lain => 0 row
-- ---------------------------------------------------------------------
UPDATE proposals SET status = 'SENT'
WHERE token = :token AND agency_id = :agency_id AND company_id = :workspace_id
  AND status = 'DRAFT'
RETURNING id, status; -- EXPECTED: 1 row jika masih DRAFT, 0 row jika sudah bukan DRAFT

-- ---------------------------------------------------------------------
-- A-06 (CP-15): Setelah approve, is_selected = required OR dipilih klien;
--        total/dp ter-recalc server-side; approved_at terisi
-- EXPECTED: mismatch_cols kosong semua
-- ---------------------------------------------------------------------
SELECT p.status,
       p.total_amount,
       p.base_price + COALESCE((SELECT SUM(a.price) FROM proposal_addons a
                                WHERE a.proposal_id = p.id AND a.is_selected),0) AS recomputed_total,
       p.dp_amount,
       ROUND((p.base_price + COALESCE((SELECT SUM(a.price) FROM proposal_addons a
                                WHERE a.proposal_id = p.id AND a.is_selected),0))
             * p.dp_percentage / 100.0, 2) AS recomputed_dp,
       p.approved_at,
       bool_or(a.is_selected AND NOT a.is_required AND a.id <> ALL(
         SELECT unnest(COALESCE(:selected_ids, '{}')::uuid[])
       )) AS unexpected_selection
FROM proposals p
LEFT JOIN proposal_addons a ON a.proposal_id = p.id
WHERE p.token = :token
GROUP BY p.status, p.total_amount, p.base_price, p.dp_amount, p.dp_percentage, p.approved_at;

-- ---------------------------------------------------------------------
-- A-07 (CP-18): Idempotensi invoice — tepat 1 invoice per proposal APPROVED
-- EXPECTED: cnt <= 1 untuk semua proposal; tidak ada duplikat nomor
-- ---------------------------------------------------------------------
SELECT p.id, p.token, COUNT(i.id) AS cnt, COUNT(DISTINCT i.number) AS distinct_numbers
FROM proposals p
JOIN invoices i ON i.id = p.dp_invoice_id
WHERE p.status = 'APPROVED' AND p.company_id = :workspace_id
GROUP BY p.id, p.token
HAVING COUNT(i.id) > 1;   -- EXPECTED: 0 rows

SELECT number, company_id, COUNT(*) FROM invoices
WHERE company_id = :workspace_id GROUP BY number, company_id HAVING COUNT(*) > 1; -- EXPECTED: 0 rows

-- ---------------------------------------------------------------------
-- A-08 (CP-19): Konten invoice DP benar
-- EXPECTED: status PENDING, due_date = approved_at::date + 14,
--           item[0].description LIKE 'DP <title> (<pct>%)', unitPrice = dp_amount,
--           tax_rate=0, discount=0, bank_snapshot & client_snapshot terisi
-- ---------------------------------------------------------------------
SELECT i.number, i.status, i.invoice_date, i.due_date,
       (p.approved_at::date + 14) = i.due_date AS due_ok,
       i.items #>> '{0,description}' AS item_desc,
       (i.items #>> '{0,unitPrice}')::numeric = p.dp_amount AS price_ok,
       i.tax_rate, i.discount,
       i.client_snapshot ? 'name' AS has_client, i.bank_snapshot ? 'accountNumber' AS has_bank,
       i.client_id, i.bank_account_id
FROM proposals p
JOIN invoices i ON i.id = p.dp_invoice_id
WHERE p.token = :token;

-- ---------------------------------------------------------------------
-- A-09 (CP-19 / SEC-07): Sequence perusahaan maju & no gap/tabrak
-- EXPECTED: lastSequence >= nomor urut invoice DP terakhir
-- ---------------------------------------------------------------------
SELECT c.styling #>> '{settings,lastSequence}' AS last_seq,
       MAX(split_part(i.number, '/', 3)::int) AS max_seen
FROM companies c
LEFT JOIN invoices i ON i.company_id = c.id
WHERE c.id = :workspace_id GROUP BY last_seq;

-- ---------------------------------------------------------------------
-- A-10 (CP-21): ensure_proposal_dp_invoice menolak non-APPROVED
-- EXPECTED: ERROR 'No approved proposal was found for this link'
-- ---------------------------------------------------------------------
-- SELECT public.ensure_proposal_dp_invoice(:token_sent);

-- ---------------------------------------------------------------------
-- A-11 (PE-04): RPC edit menolak APPROVED / PAID / sudah ber-invoice
-- EXPECTED: ERROR 'Approved proposals can no longer be edited'
-- (jalankan sbg authenticated user pemilik; gunakan payload minimal valid)
-- ---------------------------------------------------------------------
-- SELECT public.update_proposal(:proposal_id, :agency_id, :workspace_id,
--   '{"title":"x","client_name":"y","client_id":"' || :client_id || '","base_price":1,"dp_percentage":50,
--     "payment_bank_account_id":"' || :bank_id || '"}'::jsonb, '[]'::jsonb, '[]'::jsonb);

-- ---------------------------------------------------------------------
-- A-12 (PE-08): client/bank lintas workspace ditolak
-- EXPECTED: ERROR 'Select a client from this workspace' / '... bank account ...'
-- ---------------------------------------------------------------------
-- SELECT public.update_proposal(:draft_id, :agency_id, :workspace_id, jsonb_build_object(
--   'title','ok','client_name','ok','client_id', :foreign_client_id, 'base_price', 1,
--   'dp_percentage', 50, 'payment_bank_account_id', :bank_id), '[]'::jsonb, '[]'::jsonb);

-- ---------------------------------------------------------------------
-- A-13 (PE-09): Validasi angka server-side
-- EXPECTED masing-masing: ERROR 22023 'Invalid base price or down-payment percentage'
-- ---------------------------------------------------------------------
-- SELECT public.update_proposal(:draft_id, :agency_id, :workspace_id, jsonb_build_object(
--   'title','ok','client_name','ok','client_id', :client_id, 'base_price', -1,
--   'dp_percentage', 50, 'payment_bank_account_id', :bank_id), '[]'::jsonb, '[]'::jsonb);
-- SELECT public.update_proposal(:draft_id, :agency_id, :workspace_id, jsonb_build_object(
--   'title','ok','client_name','ok','client_id', :client_id, 'base_price', 1,
--   'dp_percentage', 101, 'payment_bank_account_id', :bank_id), '[]'::jsonb, '[]'::jsonb);

-- ---------------------------------------------------------------------
-- A-14 (PE-12): Edit tidak mengubah token/status/created_at
-- EXPECTED: snapshot_pre = snapshot_post kecuali updated_at
-- ---------------------------------------------------------------------
SELECT id, token, status, created_at, updated_at FROM proposals WHERE id = :proposal_id;

-- ---------------------------------------------------------------------
-- A-15 (SEC-01): RLS — hasil SELECT sebagai user B harus 0 baris utk data A
-- (jalankan via Postgrest dgn JWT B, atau SET ROLE + impersonation test harness)
-- EXPECTED: visible_to_b = 0
-- ---------------------------------------------------------------------
SELECT count(*) AS visible_to_b FROM proposals
WHERE agency_id = :agency_a AND company_id = :workspace_w1;
-- ^ jalankan dlm session yg auth.uid() = agency_b

-- ---------------------------------------------------------------------
-- A-16 (DEF-03): Inventaris dead states — pantau apakah PAID/EXPIRED pernah muncul
-- EXPECTED: 0 rows sepanjang siklus hidup fitur saat ini
-- ---------------------------------------------------------------------
SELECT status, COUNT(*) FROM proposals
WHERE status IN ('PAID','EXPIRED') GROUP BY status;

-- ---------------------------------------------------------------------
-- A-17 (RG-06): Proposal legacy (migrasi 0024) punya company_id terisi
-- EXPECTED: 0 rows orphan legacy
-- ---------------------------------------------------------------------
SELECT id, token, status FROM proposals WHERE company_id IS NULL;

-- ---------------------------------------------------------------------
-- A-18 (CP-13): Kolom signature konsisten dgn path storage
-- EXPECTED: client_signature_url LIKE '%/proposal-assets/signatures/<token>/signature.png'
-- ---------------------------------------------------------------------
SELECT token, client_signature_url,
       client_signature_url ~ ('/proposal-assets/signatures/' || token::text || '/signature\.png$') AS url_ok
FROM proposals WHERE status = 'APPROVED' AND company_id = :workspace_id;
