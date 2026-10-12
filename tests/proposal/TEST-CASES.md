# SIT Test Cases — Fitur Proposals (ProposalFolio)

**Project**: ProposalFolio · Branch `proposalfolio`
**Scope**: Create proposal → Mark sent → Client public page → Approve/Decline → Auto DP invoice → Edit guard → Dashboard & workspace scoping → RLS/Security
**Author**: SIT Tester | **Date**: 2026-10-13 | **Status**: Ready to execute

---

## 1. Test Environment & Precondition Data (Test Fixtures)

Siapkan dulu sebelum eksekusi. Semua TC bergantung pada fixture ini.

| ID | Fixture | Detail |
|---|---|---|
| F-01 | Agency user A (`AGENCY_A`) | Login utama, punya `agency_whatsapp_number` di profile metadata |
| F-02 | Agency user B (`AGENCY_B`) | Akun kedua untuk uji cross-tenant / ownership |
| F-03 | Workspace W1 (owner = A) | Punya ≥2 client: `CLIENT_1` (PT Maju), `CLIENT_2`; punya ≥1 bank account `BANK_W1` (BCA … a.n. Agency A) |
| F-04 | Workspace W2 (member = A) | Workspace kedua milik/anggota A, punya `BANK_W2` |
| F-05 | Workspace W3 (owner = B) | Milik agency lain — untuk uji isolasi tenant |
| F-06 | Proposal P-DRAFT | Status DRAFT, token valid UUIDv4, di W1 |
| F-07 | Proposal P-SENT | Status SENT di W1, base 10.000.000 + addon required 2.000.000 + addon opsional 1.500.000, DP 50% |
| F-08 | Proposal P-APPROVED | Status APPROVED, sudah punya `dp_invoice_id` |
| F-09 | Proposal P-REJECTED | Status REJECTED |
| F-10 | Proposal LEGACY | Approved sebelum migrasi 0025 (atau simulasikan: APPROVED dengan `dp_invoice_id = NULL`) |
| F-11 | Browser anonim | Mode incognito, **tanpa login** (klien publik) |
| F-12 | curl/Postman + Supabase anon key & JWT A/B | Untuk uji API-level (bypass UI) |

**Defect watchlist dari code review (prioritas tinggi)**: lihat §7 — beberapa kasus (DRAFT visible, approve tanpa verifikasi identitas, mark-sent silent no-op) berisiko FAIL by design.

---

## 2. Modul PB — Proposal Builder (Create)

Rute: `/proposals/new` · Fungsi: `createProposal()` (`src/lib/proposal.ts`)

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| PB-01 | Happy path buat proposal | Login A → menu Proposals → Create New Proposal → pilih CLIENT_1 (name/email/company auto-fill), isi title, summary, base price `10.000.000`, DP `50`, bank `BANK_W1`, 1 addon required `2.000.000`, 1 addon opsional `1.500.000`, 2 milestone → Save | Toast "Proposal saved as draft", redirect `/proposals` (replace), row baru status **DRAFT**, token UUID unik ter-generate | P0 |
| PB-02 | Perhitungan total & DP saat create | Lanjutan PB-01, cek DB/API `total_amount`, `dp_amount` | `total_amount = 12.000.000` (base + required saja; **opsional tidak dihitung**), `dp_amount = 6.000.000` (50%) | P0 |
| PB-03 | Addon required ter-select otomatis | Cek `proposal_addons` PB-01 | Required → `is_selected=true`; Opsional → `is_selected=false` | P1 |
| PB-04 | Milestone sort order | Cek `proposal_milestones` | `sort_order` 0,1 sesuai urutan input; tampil di halaman klien dengan numbering 1,2 | P1 |
| PB-05 | Validasi: client wajib | Submit tanpa pilih client | Error "Select a client from your Clients list.", tidak ada insert | P0 |
| PB-06 | Validasi: title wajib | Kosongkan title | Error "Project title is required." (required attr + guard) | P1 |
| PB-07 | Validasi: base price negatif/NaN | Input harga tidak valid | Hanya digit yang diterima (`formatPriceInput` strip karakter); error "Base price must be a valid non-negative amount." bila lolos NaN | P1 |
| PB-08 | Validasi: DP % di luar 1–100 / desimal | Isi DP `0`, `101`, `50.5` | Error "DP percentage must be a whole number from 1 to 100." | P0 |
| PB-09 | Validasi: bank account wajib | Workspace tanpa bank account (hapus semua bank W1) | Select disabled + pesan "Add a bank account in Settings first"; submit → error "Add a bank account in Settings and select it for this proposal." | P1 |
| PB-10 | Validasi: WA agency wajib | Hapus `agency_whatsapp_number` di Settings → submit | Error "Set the agency WhatsApp number in Settings before creating a proposal." | P2 |
| PB-11 | Validasi: addon tanpa judul diabaikan | Tambah baris addon kosong (title kosong) lalu save | Baris kosong tidak dikirim/disimpan (filter `title.trim()`) | P2 |
| PB-12 | Snapshot bank dibekukan | Buat proposal dgn BANK_W1 → ganti nomor rekening bank di Settings → cek row proposal | Field `payment_bank_name/account_number/holder` di proposal **tidak berubah** (snapshot) | P1 |
| PB-13 | Rollback parsial (negative test) | Simpan saat insert addons gagal (mis. blok request `proposal_addons` via devtools offline setelah insert proposals sukses) | Proposal ikut di-delete (rollback manual); user lihat error; **tidak ada yatim DRAFT tanpa addons** | P1 |
| PB-14 | Token unik | Buat 2 proposal, bandingkan `token` | Berbeda; format UUIDv4; link publik berbeda | P1 |
| PB-15 | Cancel tidak menyimpan | Isi form → Cancel | Kembali ke `/proposals`, tidak ada row baru | P2 |
| PB-16 | Double-submit proteksi | Klik Save 2× cepat (latency tinggi) | Tombol disabled saat `saving`; verifikasi hanya 1 row (catatan: bukan idempotency-key — pantau!) | P2 |

---

## 3. Modul PD — Proposal Dashboard

Rute: `/proposals` · `ProposalDashboard.tsx`

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| PD-01 | List scoped per workspace | Login A, aktifkan W1 | Hanya proposal `agency_id=A AND company_id=W1`, urut `created_at` desc | P0 |
| PD-02 | Ganti workspace reset halaman | Buat 12 proposal di W1, 1 di W2 → page 2 → switch ke W2 | Daftar W2 (1 item), pagination reset ke page 1 | P1 |
| PD-03 | Paginasi | >10 proposal | Footer "Showing 1–10 of N", Prev disabled di page 1, Next disabled di page terakhir | P1 |
| PD-04 | Badge status | Cek tiap status | DRAFT slate, SENT blue, APPROVED emerald, REJECTED rose (warna + teks sesuai enum) | P2 |
| PD-05 | Matriks tombol per status | Bandingkan baris DRAFT/SENT/APPROVED/REJECTED | DRAFT: Edit + "Mark sent & copy link" + open public. SENT/REJECTED: Edit + Copy client link + open public. **APPROVED/PAID: TANPA Edit** | P0 |
| PD-06 | Mark sent & copy link | Klik "Mark sent & copy link" pd P-DRAFT | Status → SENT (guard `.eq("status","DRAFT")`), toast "marked as sent" + link `${origin}/p/<token>` ke clipboard | P0 |
| PD-07 | Mark sent saat clipboard ditolak | Browser tanpa permission clipboard | Tetap SENT; toast error berisi link manual untuk copy | P2 |
| PD-08 | Copy client link (non-draft) | Klik "Copy client link" pd P-SENT | Clipboard = URL publik benar | P1 |
| PD-09 | Open public view | Klik ikon ExternalLink | Tab baru `/p/<token>` render tanpa perlu login | P1 |
| PD-10 | Empty state | Workspace tanpa proposal | "No proposals yet" + CTA Create | P2 |
| PD-11 | Load error + retry | Blok request `proposals` (offline sesaat) | Alert error + tombol "Try again" → reload sukses | P2 |
| PD-12 | Menu navigasi | Sidebar sebagai user login | Item "Proposals" muncul & aktif di rute `/proposals*` | P2 |
| PD-13 | Akses tanpa login | Buka `/proposals` anonymous | Di-redirect ke login / tidak render data (auth gate layout) | P0 |

---

## 4. Modul CP — Halaman Publik Klien (`/p/:token`)

`ClientProposal.tsx` + RPC `get_public_proposal`, `respond_to_proposal`, `ensure_proposal_dp_invoice`

### 4.1 Rendering & Akses

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| CP-01 | Render proposal SENT anonim | Incognito buka link P-SENT | Loading → artikel: title, "Prepared for <client> · <company>", summary, pricing (base + addons dgn badge Required/Optional), milestones bernomor, signature canvas + terms checkbox + tombol Approve/Decline | P0 |
| CP-02 | Token invalid format | `/p/not-a-uuid`, `/p/123e...` (UUID v1), string panjang | "This proposal link is invalid." — **tanpa** panggilan RPC | P1 |
| CP-03 | Token valid tapi tak ada | `/p/<uuid-acak>` | "Proposal unavailable — This proposal could not be found." | P1 |
| CP-04 | Route publik di luar layout | Perhatikan chrome halaman `/p/...` | Tanpa sidebar/dashboard (public route) | P2 |
| CP-05 | DRAFT juga visible? | Buka link P-DRAFT sebelum mark sent | **Ditemukan oleh RPC** (get_public_proposal tidak filter status) → tampil sebagai "Proposal status: DRAFT" tanpa form respon. ⚠ Confirm with BA: idealnya DRAFT hidden/404 (lihat Defect DEF-05) | P1 |
| CP-06 | Live total & DP saat centang addon | Centang/uncheck addon opsional 1.5jt | "Proposal total" & "Down payment (50%)" berubah live (12jt→13.5jt; DP 6jt→6.75jt); uncheck addon **required** tidak mungkin (checkbox hanya utk optional) | P0 |
| CP-07 | State addon dipertahankan | Reload halaman setelah centang (sebelum approve) | Selection **reset** ke default DB (`is_selected`) — expected perilaku; dokumentasikan ke user | P3 |

### 4.2 Approve / Decline

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| CP-10 | Approve happy path | P-SENT: centang addon opsional, gambar signature, centang "Saya menyetujui…", klik Approve | Toast approved; UI → panel emerald "Proposal approved", signature tampil (signed URL ≤1 jam), tombol **"View DP invoice (Rp …)"** → `/i/<invoiceId>` | P0 |
| CP-11 | Approve tanpa signature | Kosongkan canvas, centang terms → Approve | Ditolak sisi klien: toast "Add your signature and accept the proposal terms before approving." Tidak ada RPC write | P0 |
| CP-12 | Approve tanpa centang terms | Signature ada, terms belum → Approve | Toast yang sama; tidak ada perubahan status | P0 |
| CP-13 | Signature upload path & bucket | Cek storage `proposal-assets` | Object `signatures/<token>/signature.png` dibuat (upsert), content-type image/png; `client_signature_url` cocok regex `/proposal-assets/signatures/<token>/signature\.png$` | P1 |
| CP-14 | Upload signature saat bukan SENT (API) | curl POST storage dgn token proposal APPROVED/REJECTED/DRAFT | **Ditolak** policy `can_upload_proposal_signature` (hanya status SENT) | P0 security |
| CP-15 | Recalc total di server | Setelah CP-10, cek DB | `is_selected` addon optional → true; `total_amount = base + Σ selected`; `dp_amount = total × 50%`; `approved_at = now()`; status APPROVED | P0 |
| CP-16 | Selected addon ids asing (API) | curl `respond_to_proposal` dgn `p_selected_addon_ids` berisi UUID milik proposal lain | Function pakai `id = ANY(...)` atas addons **milik proposal itu saja** → tidak ada cross-proposal mutation; total tetap benar | P0 security |
| CP-17 | Signature URL spoof (API) | Approve via curl dgn `p_signature_url` = URL eksternal / path token lain | Exception `22023` "A valid proposal signature is required"; status tetap SENT | P0 security |
| CP-18 | Approve double-click / 2 tab | Kirim `respond_to_proposal` APPROVED 2× paralel (curl/ab) | Row lock `FOR UPDATE ... AND status='SENT'`: hanya 1 sukses ubah; respons kedua `{ok:false}` → UI "no longer accepting a response"; **tepat 1 invoice** | P0 |
| CP-19 | Auto-invoice DP konten | Setelah approve, cek invoice di dashboard Invoices | Number `<PREFIX>/<COMPANY_CODE>/NNNN` (sequence companies.styling.lastSequence+1, lpad 4), status PENDING, due date = approved_at+14 hari, item `"DP <title> (50%)"` qty 1 unitPrice = dp_amount, client_snapshot & bank_snapshot terisi, tax 0 discount 0 | P0 |
| CP-20 | Invoice fallback (LEGACY) | Buka `/p/<token>` utk LEGACY (APPROVED, dp_invoice_id NULL) | Otomatis panggil `ensure_proposal_dp_invoice` → invoice dibuat, tombol View DP invoice muncul. Jika gagal → panel amber + "Try again" | P0 |
| CP-21 | ensure saat bukan APPROVED (API) | curl `ensure_proposal_dp_invoice` token P-SENT/P-DRAFT | Exception "No approved proposal was found for this link"; tidak ada invoice | P0 security |
| CP-22 | Konfirmasi REJECTED | Klik Decline (tanpa signature) | Toast "Your response was sent."; status REJECTED; halaman show "Proposal status: REJECTED", tanpa form respon | P1 |
| CP-23 | Response setelah REJECTED | Approve lagi via link yg sama | `ok:false` → tidak bisa diubah; status tetap REJECTED (butuh proposal baru) | P1 |
| CP-24 | Signature terlihat post-approve | Di halaman approved & di invoice publik `/i/...` | img signature render (policy read 0027); jika gagal load → alert "The client signature could not be displayed." | P1 |
| CP-25 | Read signature sebelum approved (API) | GET object `signatures/<token>/signature.png` (anon) utk proposal masih SENT | Read policy menuntut status APPROVED (`can_read_approved_proposal_signature`) → **ditolak** | P0 security |
| CP-26 | Offline saat approve | Putuskan network setelah klik Approve | Toast error, status tetap SENT, bisa retry; tidak ada half-state (invoice tidak tercipta) | P1 |
| CP-27 | Invalid response value (API) | curl `respond_to_proposal` p_response="MAYBE" | Exception "Unsupported proposal response" (22023) | P2 security |

---

## 5. Modul PE — Edit Proposal

Rute `/proposals/:id/edit` · RPC `update_proposal` (0028)

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| PE-01 | Edit happy path (DRAFT/SENT) | Edit P-SENT: ubah title, base price 10jt→8jt, hapus 1 addon, tambah milestone → Save Changes | Toast "Proposal updated."; total & dp_amount di-recalc server (8jt + required); addons lama **dihapus-di-reinsert**; milestones sort_order 0..n; kembali ke dashboard | P0 |
| PE-02 | Form prefill | Buka edit P-SENT | Semua field terisi sesuai DB, termasuk harga ter-format ribuan, bank terpilih, addons/milestones | P1 |
| PE-03 | Blokir edit APPROVED (UI) | Paksa URL `/proposals/<P-APPROVED>/edit` | Banner "Approved proposals can no longer be edited." + link back; form tidak dirender | P0 |
| PE-04 | Blokir edit via API | curl `update_proposal` sbg A utk P-APPROVED / P-PAID / proposal yg `dp_invoice_id`-nya sudah terisi | Exception "Approved proposals can no longer be edited" (cek status + `dp_invoice_id IS NOT NULL` + FOR UPDATE) | P0 security |
| PE-05 | Cross-workspace edit | URL edit proposal W2 saat activeCompanyId=W1 | "This proposal was not found in the current workspace."; API: exception "Proposal not found in this workspace" | P0 security |
| PE-06 | Ownership check (API) | JWT A panggil `update_proposal` p_agency_id=B / proposal milik B | Exception "Not authorized to edit this proposal" (42501) | P0 security |
| PE-07 | Anon call RPC | Anon key panggil `update_proposal` | Ditolak (REVOKE dari anon; GRANT authenticated only) | P0 security |
| PE-08 | Payload lintas tenant | Update dgn `client_id` milik W3 / `payment_bank_account_id` milik W3 | Exception "Select a client/bank account from this workspace"; data lama utuh | P0 security |
| PE-09 | Validasi server-side | curl payload: title whitespace-only, base_price -1, dp_percentage 0/101, addon price -5, addon title kosong, milestone title kosong, p_addons bukan array | Masing-masing exception 22023 sesuai pesan function; tidak ada partial update (atomic dalam 1 fungsi) | P1 |
| PE-10 | Trim & null-normalisasi | Simpan dgn spasi berlebih di title/name; company & summary spasi-only | Tersimpan trimmed; empty string → NULL | P2 |
| PE-11 | Edit race vs approve | Tab klien approve tepat sebelum admin save edit | FOR UPDATE serialize: salah satu menang; jika approve duluan → edit ditolak; jika edit duluan → total approve dihitung dari addons terbaru. Tidak ada state rusak | P1 |
| PE-12 | Token & status tidak berubah | Setelah edit | `token`, `status`, `created_at` tetap; `updated_at` naik | P2 |
| PE-13 | Edit setelah mark sent boleh | Edit P-SENT (sudah dibagi ke klien) lalu refresh link klien | Update berhasil (by-design SENT editable); klien melihat konten terbaru via link sama (token tidak berubah). Catat sebagai perilaku, bukan defect | P2 |

---

## 6. Modul SEC — RLS, Multi-tenant & Isolation

| TC | Judul | Langkah | Expected Result | Prioritas |
|---|---|---|---|---|
| SEC-01 | RLS tabel proposals | JWT B SELECT `proposals` WHERE agency_id=A | 0 rows (hanya owner + anggota workspace via is_company_member) | P0 |
| SEC-02 | Workspace member akses | User C = member W1 (bukan owner) → dashboard & RPC | Bisa list/edit proposal W1 sesuai policy 0023 | P1 |
| SEC-03 | Public RPC tidak bocor field sensitif | Respons `get_public_proposal` | Tidak memuat `client_email`, `agency_whatsapp_number`, `payment_*`, `agency_id`, `client_id` (hanya whitelist kolom 0027); `client_signature_path` hanya saat APPROVED | P0 |
| SEC-04 | `_create_proposal_dp_invoice` privat | EXECUTE via anon & authenticated | Permission denied (REVOKE ALL) | P0 |
| SEC-05 | Company soft-deleted | Soft-delete W1 → approve proposal di dalamnya | Exception "The proposal workspace is unavailable"; rollback (status tidak jadi APPROVED karena 1 transaksi) | P1 |
| SEC-06 | Bank hilang saat konversi | Proposal tanpa snapshot bank + workspace dgn 0 atau ≥2 bank → approve | Exception "Add a payment bank account…" → seluruh respond rollback; pantau apakah klien bisa retry normal | P1 |
| SEC-07 | Nomor invoice tidak duplikat | Generate invoice reguler & DP bergantian hingga tabrakan sequence | LOOP skip nomor yang sudah ada; unique constraint tidak violated; lastSequence ter-update | P1 |
| SEC-08 | Match client via email fallback | Proposal `client_id=NULL`, email cocok 1 client W1 → approve | Invoice `client_id` terisi hasil match; jika 0/≥2 match → tetap NULL tanpa error | P2 |

---

## 7. Defect Watchlist (hasil static review — konfirmasi saat SIT)

| ID | Temuan | Risiko | Rekomendasi |
|---|---|---|---|
| DEF-01 | **markProposalSent silent no-op**: update dengan guard `.eq("status","DRAFT")` tidak memeriksa jumlah row terpengaruh; UI optimistically set SENT + copy link walau DB mungkin tidak berubah (race dengan jalur lain) | Sedang | TC PD-06 varian race; minta dev assert count / refetch |
| DEF-02 | **Prefix invoice edge-case**: `regexp_replace('[[:space:]/]+','')` pada setting `invoicePrefix` mis. "/" → fallback "INV" ok, tapi kombinasi aneh ("///", angka saja) perlu diuji agar tidak menghasilkan nomor tak bermakna | Rendah | SEC-07 varian input settings |
| DEF-03 | **Status PAID/EXPIRED dead states**: tidak ada jalur kode yang men-setnya; pembayaran dilacak via invoice DP. Dashboard/client page handle PAID tapi tak pernah terjadi | Info | Konfirmasi produk; kemungkinan fitur follow-up |
| DEF-04 | **Create tidak punya guard RPC**: `createProposal` insert langsung (RLS-only), validasi hanya di klien — beda dengan edit yang hardened di 0028. Payload nakal via API bisa lewati aturan (mis. dp_percentage 0/101, client lintas workspace?) selama RLS mengizinkan | Tinggi | Uji API-level: insert proposals dgn client_id workspace lain; laporkan hasil |
| DEF-05 | **DRAFT & REJECTED visible via link**: `get_public_proposal` tanpa filter status → pemegang link bisa melihat isi proposal DRAFT/REJECTED | Sedang–Tinggi | Keputusan BA: batasi ke SENT/APPROVED (TC CP-05) |
| DEF-06 | **Approve tanpa verifikasi identitas**: siapa pun dengan link (anon) bisa approve & membubuhkan "signature" — tidak ada OTP/verification email | Tinggi (legalitas e-sign) | Risk accepted? Catat sebagai limitation (CP-01 eksplisit anon) |
| DEF-07 | **Rollback create non-atomik**: jika delete rollback ikut gagal → proposal yatim tanpa addons; error message sudah menangani, tapi perlu recovery story | Sedang | Uji PB-13; monitoring |
| DEF-08 | **Signature existence tidak diverifikasi**: `respond_to_proposal` cuma cek regex URL, tidak memastikan object benar-benar ter-upload (upload policy yang menjaga timing-nya; object bisa dihapus/ditimpa setelahnya selama status SENT) | Rendah | Kombinasi CP-14/CP-17 menutup sebagian besar risiko |

---

## 8. Regression Suite (dampak ke modul lain)

| TC | Area | Check |
|---|---|---|
| RG-01 | Invoices | Invoice manual masih bisa dibuat; nomor sequence perusahaan tidak bentrok dgn invoice DP hasil proposal |
| RG-02 | Public invoice `/i/:id` | Invoice DP hasil proposal tampil normal incl. signature (fitur 0026) & flow bayar/lapor |
| RG-03 | Clients | Combobox client di builder memakai data workspace aktif |
| RG-04 | Settings | Perubahan bank/WA tidak mengubah snapshot proposal lama (PB-12) |
| RG-05 | Auth/routing | Rute lama (`/`, `/invoices`, dst.) tidak berubah; `/p/*` tetap publik |
| RG-06 | Legacy migration | Proposal legacy (0024) masih tampil & bisa direspons/di-ensure invoice |

---

## 9. Exit Criteria

- **Pass**: 100% P0, ≥95% P1, ≥90% P2; semua security TC (P0 security) wajib PASS tanpa exception.
- Blocking defects untuk DEF-05/DEF-06 butuh keputusan BA sebelum sign-off.
- Evidence per TC: screenshot/network log + query SQL hasil (DB assertion) dicatat di sheet eksekusi.
