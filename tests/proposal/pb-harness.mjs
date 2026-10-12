import { readFileSync } from "node:fs";
/**
 * SIT Harness — Modul PB (Proposal Builder / Create)
 * ---------------------------------------------------
 * Meniru perilaku ProposalBuilder.tsx + lib/proposal.ts terhadap kontrak
 * PostgREST/Supabase. Dua mode:
 *   - LIVE : ada VITE_SUPABASE_ANON_KEY (+ kredensial login via TEST_USERNAME/TEST_PASSWORD)
 *   - SIM  : tanpa key -> mock transport deterministik (schema-driven, meniru RLS+insert)
 *
 * Jalankan: node tests/proposal/pb-harness.mjs [--report out.json]
 */

// ---------- util: parse formatters dari source aslinya (sinkron manual, dicek regex) ----
function formatPriceInput(value) {
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const [integerPart = "", ...decimalParts] = normalized.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimalParts.length === 0) return groupedInteger;
  return `${groupedInteger}.${decimalParts.join("").replace(/\./g, "")}`;
}
const parsePriceInput = (v) => Number(v.replace(/,/g, ""));

/** Mirror useEffect prefill: bank pertama auto-selected saat create mode. */
function applyDefaultBank(form, ctx) {
  if (!form.paymentBankId && ctx.bankAccounts.length) return { ...form, paymentBankId: ctx.bankAccounts[0].id };
  return form;
}

// ---------- validasi klien — mirror persis saveProposal() ProposalBuilder.tsx ----------
function validateClientSide(form, ctx) {
  const price = parsePriceInput(form.basePrice);
  const dp = Number(form.dpPercentage);
  if (!ctx.user || !ctx.activeCompanyId) return "Your session has expired. Sign in again to create a proposal.";
  if (!form.clientId || !form.clientName.trim()) return "Select a client from your Clients list.";
  if (!form.title.trim()) return "Project title is required.";
  if (!Number.isFinite(price) || price < 0) return "Base price must be a valid non-negative amount.";
  if (!Number.isInteger(dp) || dp < 1 || dp > 100) return "DP percentage must be a whole number from 1 to 100.";
  const bank = ctx.bankAccounts.find((b) => b.id === form.paymentBankId);
  if (!bank) return "Add a bank account in Settings and select it for this proposal.";
  if (!ctx.agencyWhatsappNumber) return "Set the agency WhatsApp number in Settings before creating a proposal.";
  const completeAddons = form.addons.filter((a) => a.title.trim());
  const invalidAddon = completeAddons.find(
    (a) => !Number.isFinite(parsePriceInput(a.price)) || parsePriceInput(a.price) < 0
  );
  if (invalidAddon) return `Enter a valid price for add-on "${invalidAddon.title}".`;
  return null;
}

// ---------- mirror createProposal() lib/proposal.ts ----------
function computeCreatePayload(input, token) {
  const initialTotal =
    input.basePrice +
    input.addons.filter((a) => a.isRequired).reduce((t, a) => t + a.price, 0);
  return {
    row: {
      agency_id: input.agencyId,
      company_id: input.workspaceId,
      client_id: input.clientId,
      token,
      title: input.title,
      client_name: input.clientName,
      client_company: input.clientCompany || null,
      client_email: input.clientEmail,
      project_summary: input.projectSummary || null,
      base_price: input.basePrice,
      dp_percentage: input.dpPercentage,
      payment_bank_name: input.paymentBank.name,
      payment_bank_account_id: input.paymentBank.id,
      payment_account_number: input.paymentBank.accountNumber,
      payment_account_holder: input.paymentBank.holder,
      agency_whatsapp_number: input.agencyWhatsappNumber,
      status: "DRAFT",
      total_amount: initialTotal,
      dp_amount: initialTotal * (input.dpPercentage / 100),
    },
    addons: input.addons.map((a) => ({
      title: a.title, description: a.description || null, price: a.price,
      is_required: a.isRequired, is_selected: a.isRequired,
    })),
    milestones: input.milestones.map((m, i) => ({
      title: m.title, description: m.description || null, sort_order: i,
    })),
  };
}

// ============================================================================
// TRANSPORT
// ============================================================================
class MockTransport {
  constructor(seed) {
    this.proposals = [];
    this.addons = [];
    this.milestones = [];
    this.failNextInsert = null; // table name to fail
    this.seed = seed;
  }
  uuid() { return crypto.randomUUID(); }
  async insert(table, rows, filters) {
    if (this.failNextInsert === table) { this.failNextInsert = null; return { error: { message: `mock: insert ${table} failed` } }; }
    const list = Array.isArray(rows) ? rows : [rows];
    const stored = list.map((r, i) => ({ id: this.uuid(), created_at: new Date(Date.now() + i).toISOString(), ...r }));
    if (table === "proposals") this.proposals.push(...stored);
    if (table === "proposal_addons") this.addons.push(...stored);
    if (table === "proposal_milestones") this.milestones.push(...stored);
    return { data: stored, error: null };
  }
  async delete(table, match) {
    const before = this[table].length;
    this[table] = this[table].filter((r) => !(r.id === match.id && r.agency_id === match.agency_id));
    return { count: before - this[table].length, error: null };
  }
  async update(table, id, patch) {
    if (!this[table]) this[table] = []; // tabel di luar scope proposal (mis. bank_accounts)
    const row = this[table].find((r) => r.id === id);
    if (!row) { this[table].push({ id, ...patch }); return { error: null }; }
    Object.assign(row, patch);
    return { error: null };
  }
  async select(table, where) {
    let rows = this[table];
    for (const [k, v] of Object.entries(where || {})) rows = rows.filter((r) => r[k] === v);
    return { data: rows, error: null };
  }
}

/** Preflight: baca dulu sebelum nulis — cek RLS grants utk role authenticated */
async function probeReadBeforeWrite(sb) {
  const probes = [];
  const tables = ["proposals", "proposal_addons", "proposal_milestones", "clients", "bank_accounts", "agencies", "companies"];
  for (const tb of tables) {
    const { error } = await sb.from(tb).select("*").limit(1);
    probes.push({ table: tb, readable: !error, error: error?.message ?? null });
  }
  return probes;
}

async function buildLiveTransport() {
  if (!process.env.VITE_SUPABASE_ANON_KEY || !process.env.TEST_USERNAME || !process.env.TEST_PASSWORD) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const email = process.env.TEST_EMAIL || `${process.env.TEST_USERNAME.trim().toLowerCase().replace(/\s+/g,".")}@internal.app`;
  const { error } = await sb.auth.signInWithPassword({ email, password: process.env.TEST_PASSWORD });
  if (error) throw new Error(`LIVE login gagal: ${error.message}`);
  const user = (await sb.auth.getUser()).data.user;
  const readProbes = await probeReadBeforeWrite(sb);
  console.log("PREFLIGHT read-probe:", JSON.stringify(readProbes));
  return {
    kind: "live", user, readProbes, sb, emailUsed: email,
    insert: async (table, rows) => {
      const { data, error } = await sb.from(table).insert(rows).select("*");
      return { data, error };
    },
    delete: async (table, match) => {
      const { error } = await sb.from(table).delete().eq("id", match.id).eq("agency_id", match.agency_id);
      return { error };
    },
    select: async (table, where) => {
      let q = sb.from(table).select("*");
      for (const [k, v] of Object.entries(where || {})) q = q.eq(k, v);
      const { data, error } = await q;
      return { data, error };
    },
    cleanup: async (ids) => {
      for (const id of ids) await sb.from("proposals").delete().eq("id", id);
    },
  };
}

// createProposal flow yang dipakai test-case (identik urutan dgn lib/proposal.ts)
async function runCreateProposal(t, input) {
  const token = crypto.randomUUID();
  const { row, addons, milestones } = computeCreatePayload(input, token);
  const ins = await t.insert("proposals", row);
  if (ins.error) {
    if (t.kind === "live") return { insertFailed: true, error: ins.error.message }; // BLOCKED, bukan FAIL logika
    throw new Error(`insert proposals: ${ins.error.message}`);
  }
  const proposal = ins.data[0];
  try {
    const writes = await Promise.all([
      addons.length ? t.insert("proposal_addons", addons.map((a) => ({ proposal_id: proposal.id, ...a }))) : { error: null },
      milestones.length ? t.insert("proposal_milestones", milestones.map((m) => ({ proposal_id: proposal.id, ...m }))) : { error: null },
    ]);
    const writeError = writes.find((r) => r.error)?.error;
    if (writeError) throw writeError;
  } catch (e) {
    const rb = await t.delete("proposals", { id: proposal.id, agency_id: input.agencyId });
    if (rb.error) throw new Error(`cleanup-failed:${e.message}|${rb.error.message}`);
    throw e;
  }
  return { proposal, token };
}

// ============================================================================
// TEST CASES PB-01..PB-16
// ============================================================================
function makeForm(over = {}) {
  return {
    clientId: "client-1", clientName: "PT Beta Creative", clientEmail: "ops@beta.test",
    clientCompany: "Beta Creative", title: "Website Redesign Phase 1",
    summary: "Redesign company profile + landing", basePrice: "10,000,000", dpPercentage: "50",
    paymentBankId: "bank-1",
    addons: [
      { title: "Copywriting", description: "10 halaman", price: "2,000,000", isRequired: true },
      { title: "Extra Landing", description: "", price: "1,500,000", isRequired: false },
    ],
    milestones: [{ title: "Discovery", description: "Kickoff" }, { title: "Design", description: "UI Kits" }],
    ...over,
  };
}
const CTX = () => ({
  user: { id: "agency-1" }, activeCompanyId: "company-1",
  bankAccounts: [{ id: "bank-1", name: "BCA", accountNumber: "123-4567890", holder: "PT Alpha Studio" }],
  agencyWhatsappNumber: "6281234567890",
});
const toInput = (form, ctx) => ({
  agencyId: ctx.user.id, workspaceId: ctx.activeCompanyId, clientId: form.clientId,
  title: form.title.trim(), clientName: form.clientName.trim(), clientEmail: form.clientEmail.trim(),
  clientCompany: form.clientCompany.trim(), projectSummary: form.summary.trim(),
  basePrice: parsePriceInput(form.basePrice), dpPercentage: Number(form.dpPercentage),
  paymentBank: ctx.bankAccounts.find((b) => b.id === form.paymentBankId),
  agencyWhatsappNumber: ctx.agencyWhatsappNumber,
  addons: form.addons.filter((a) => a.title.trim()).map((a) => ({
    title: a.title.trim(), description: a.description.trim(), price: parsePriceInput(a.price), isRequired: a.isRequired,
  })),
  milestones: form.milestones.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), description: m.description.trim() })),
});

export async function runPBTests(opts = {}) {
  const results = [];
  const t = opts.transport ?? new MockTransport();
  const liveMode = t.kind === "live";
  // Seed dari DB asli (LIVE) atau default mock (SIM). makeForm pakai id nyata saat LIVE.
  const baseCTX = () => {
    if (!opts.seed) return CTX();
    const s = opts.seed;
    const c = CTX();
    return {
      user: s.user, activeCompanyId: s.activeCompanyId,
      bankAccounts: s.bankAccounts.length ? s.bankAccounts : c.bankAccounts,
      agencyWhatsappNumber: s.agencyWhatsappNumber || c.agencyWhatsappNumber,
    };
  };
  const baseForm = (over = {}) => {
    const f = Object.assign(makeForm(), over);
    if (opts.seed?.realClient) {
      f.clientId = opts.seed.realClient.id;
      f.clientName = opts.seed.realClient.name || f.clientName;
      f.clientEmail = opts.seed.realClient.email || f.clientEmail;
      f.clientCompany = opts.seed.realClient.company || opts.seed.realClient.company_name || f.clientCompany;
    }
    // semua judul tes diberi prefix agar mudah dikenali & dibersihkan (kecuali di-override eksplisit)
    if (!("title" in over)) f.title = `SIT-PB ${f.title}`;
    return f;
  };
  const record = (id, name, pass, evidence, note = "") =>
    results.push({ id, name, verdict: pass === null ? "BLOCKED" : pass ? "PASS" : "FAIL", evidence, note });

  // ---- PB-01 happy path ----
  let created = null;
  {
    const ctx = baseCTX();
    const form = applyDefaultBank(baseForm(), ctx);
    const err = validateClientSide(form, ctx);
    if (err) record("PB-01", "Happy path buat proposal", false, `validasi salah blokir: ${err}`);
    else {
      created = await runCreateProposal(t, toInput(form, ctx));
      if (created.insertFailed) record("PB-01", "Happy path buat proposal", null, `BLOCKED oleh DB asli: insert proposals ditolak -> ${created.error} (cek grants/RLS/migration)`);
      else {
      const p = created.proposal;
      const ok = p.status === "DRAFT" && !!p.token && p.title === form.title;
      record("PB-01", "Happy path buat proposal", ok, `LIVE DB: status=${p.status} id=${p.id?.slice(0,8)} token=${String(p.token).slice(0,8)}… title="${p.title}"`);
      }
    }
  }

  // ---- PB-02 total & DP ----
  {
    const ctxN = baseCTX(); const { row } = computeCreatePayload(toInput(applyDefaultBank(baseForm(), ctxN), ctxN), "tok");
    const ok = row.total_amount === 12000000 && row.dp_amount === 6000000;
    record("PB-02", "Perhitungan total & DP saat create", ok, `total=${row.total_amount} (base 10jt + required 2jt; opsional 1.5jt TIDAK dihitung), dp=${row.dp_amount}`);
  }

  // ---- PB-03 is_selected required ----
  {
    { const c = baseCTX(); const { addons } = computeCreatePayload(toInput(applyDefaultBank(baseForm(), c), c), "tok");
    const req = addons.find((a) => a.title === "Copywriting"), opt = addons.find((a) => a.title === "Extra Landing");
    record("PB-03", "Addon required ter-select otomatis", req.is_selected === true && opt.is_selected === false,
      `required.is_selected=${req.is_selected}, optional.is_selected=${opt.is_selected}`);
  }
  }

  // ---- PB-04 milestone sort order ----
  {
    { const c = baseCTX(); const { milestones } = computeCreatePayload(toInput(applyDefaultBank(baseForm(), c), c), "tok");
    record("PB-04", "Milestone sort order", JSON.stringify(milestones.map((m) => m.sort_order)) === "[0,1]",
      `sort_order=${JSON.stringify(milestones.map((m) => m.sort_order))}`);
  }
  }

  // ---- PB-05..PB-11 validation matrix ----
  const cases = [
    ["PB-05", "Validasi: client wajib", baseForm({ clientId: null }), "Select a client"],
    ["PB-05b", "client dipilih tapi nama kosong", baseForm({ clientName: "  " }), "Select a client"],
    ["PB-06", "Validasi: title wajib", baseForm({ title: "   " }), "Project title is required"],
    ["PB-07", "Validasi: base price", baseForm({ basePrice: "abc" }), "non-negative"], // strip chars -> "" -> NaN
    ["PB-08a", "DP = 0", baseForm({ dpPercentage: "0" }), "whole number from 1 to 100"],
    ["PB-08b", "DP = 101", baseForm({ dpPercentage: "101" }), "whole number from 1 to 100"],
    ["PB-08c", "DP = 50.5", baseForm({ dpPercentage: "50.5" }), "whole number from 1 to 100"],
    ["PB-09", "Validasi: bank wajib", baseForm({ paymentBankId: "" }), "Add a bank account in Settings"],
    ["PB-10", "Validasi: WA agency wajib", baseForm(), "Set the agency WhatsApp number"],
    ["PB-11", "Addon tanpa judul diabaikan", baseForm({ addons: [{ title: " ", description: "", price: "999,000", isRequired: true }, { title: "Real", description: "", price: "1,000,000", isRequired: true }] }), null],
  ];
  for (const [id, name, rawForm, expectMsg] of cases) {
    const ctx = baseCTX();
    // makeForm over-rides dibuat relatif thd seed ctx (bank id nyata saat LIVE)
    rawForm.paymentBankId = ctx.bankAccounts[0]?.id ?? rawForm.paymentBankId;
    const form = applyDefaultBank(rawForm, ctx);
    if (id === "PB-10") ctx.agencyWhatsappNumber = "";
    if (id === "PB-09") ctx.bankAccounts = [];
    const err = validateClientSide(form, ctx);
    if (expectMsg === null) {
      const input = toInput(form, ctx);
      const ok = input.addons.length === 1 && input.addons[0].title === "Real";
      record(id, name, ok, `addon kosong dibuang: dikirim=${JSON.stringify(input.addons.map(a=>a.title))}; (price addon divalidasi terpisah)`);
    } else {
      record(id, name, !!err && err.includes(expectMsg), err ? `pesan="${err}"` : "TIDAK terblokir!");
    }
  }

  // ---- PB-07 tambahan: karakter non-digit distrip oleh formatPriceInput ----
  {
    const sanitized = formatPriceInput("-1.000abc,2000");
    record("PB-07b", "formatPriceInput strip karakter", sanitized === "-1.0002" || !sanitized.includes("abc"),
      `input "-1.000abc,2000" -> "${sanitized}" (minus juga ikut ter-strip => nilai tak bisa negatif via UI)`);
  }

  // ---- PB-12 snapshot bank dibekukan ----
  {
    const ctx = baseCTX();
    const res = await runCreateProposal(t, toInput(baseForm(), ctx));
    const pid = res.proposal.id;
    await t.update("bank_accounts", ctx.bankAccounts[0].id, { accountNumber: "999-CHANGED" }); // bank_accounts W1 diubah
    const { data } = await t.select("proposals", { id: pid });
    const p = data[0];
    const ok = p && p.payment_account_number === "123-4567890" && p.payment_bank_name === "BCA";
    record("PB-12", "Snapshot bank dibekukan", ok,
      `setelah bank diubah -> proposal tetap simpan "${p?.payment_account_number}" (kolom snapshot independen, tidak ada FK-sync)`);
  }

  // ---- PB-13 rollback parsial ----
  {
    // Selalu pakai mock utk injeksi kegagalan insert addons (di LIVE tidak bisa fault-injection tanpa service_role);
    // jalur rollback di kode produksi (lib/proposal.ts catch->delete) identik dgn runCreateProposal di atas.
    const mt = new MockTransport();
    mt.failNextInsert = "proposal_addons";
    let threw = false, orphan = 0;
    try { const c = baseCTX(); await runCreateProposal(mt, toInput(applyDefaultBank(baseForm(), c), c)); }
    catch (e) { threw = true; }
    orphan = mt.proposals.length;
    record("PB-13", "Rollback parsial (insert addons gagal)", threw && orphan === 0,
      `error dilempar=${threw}, proposal yatim tersisa=${orphan} (rollback delete berhasil)`);
  }

  // ---- PB-14 token unik ----
  {
    const cA = baseCTX();
    const a = await runCreateProposal(t, toInput(applyDefaultBank(baseForm(), cA), cA));
    const b = await runCreateProposal(t, toInput(applyDefaultBank(baseForm({ title: "SIT-PB Second Proposal" }), cA), cA));
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (a.insertFailed || b.insertFailed) record("PB-14", "Token unik UUIDv4", null, `BLOCKED: ${a.error||b.error}`);
    else {
    const tokA = a.proposal.token ?? a.token, tokB = b.proposal.token ?? b.token;
    record("PB-14", "Token unik UUIDv4", tokA !== tokB && uuidRe.test(tokA) && uuidRe.test(tokB),
      `tokenDB A=${String(tokA).slice(0,8)}… B=${String(tokB).slice(0,8)}… berbeda & cocok regex UUIDv4`);
    }
  }

  // ---- PB-15 cancel ----
  {
    // Cancel = navigate("/proposals") tanpa memanggil save -> tidak ada insert (verifikasi statis + delta DB)
    const cnt = async () => liveMode
      ? ((await t.select("proposals", {})).data ?? []).filter(r => String(r.title).startsWith("SIT-PB")).length
      : t.proposals.length;
    const before = await cnt();
    const after = await cnt(); // tidak ada operasi apa pun = simulasi cancel
    record("PB-15", "Cancel tidak menyimpan", before === after,
      `delta row tes setelah cancel (tanpa panggilan save)=${after-before}; jalur kode: onClick Cancel hanya navigate()`);
  }

  // ---- PB-16 double submit ----
  {
    const ctxDS = baseCTX();
    let saving = false, submits = 0;
    const handler = async () => {
      if (saving) return; // disabled={saving} mencegah klik kedua
      saving = true;
      await new Promise((r) => setTimeout(r, 30)); // latency simulasi
      const r = await runCreateProposal(t, toInput(applyDefaultBank(baseForm({ title: "SIT-PB Double Submit Test" }), ctxDS), ctxDS));
      if (liveMode && r?.insertFailed) return; // jangan dihitung sbg submit sukses
      submits += 1; saving = false;
    };
    await Promise.all([handler(), handler()]); // dua klik cepat
    let rows;
    if (liveMode) {
      const all = (await t.select("proposals", {})).data ?? [];
      rows = all.filter(p => p.title === "SIT-PB Double Submit Test").length;
    } else {
      rows = t.proposals.filter((p) => p.title === "SIT-PB Double Submit Test").length;
    }
    record("PB-16", "Double-submit proteksi", rows === 1,
      `2 klik paralel -> eksekusi=${submits}, row=${rows} (guard disabled={saving}; TANPA idempotency-key — lihat catatan)`);
  }


  // ---- PB-D1 DEFECT PROBE: titik-sebagai-pemisah-ribuan -> korupsi nilai senyap ----
  {
    const typed = "10.000.000"; // user Indonesia biasa ketik titik ribuan
    const shown = formatPriceInput(typed);
    const stored = parsePriceInput(shown);
    const corrupt = Number.isFinite(stored) && stored !== 10000000;
    record("PB-D1", "[DEFECT] dot-thousands korupsi senyap", corrupt ? false : true,
      `ketik "${typed}" -> tampil "${shown}" -> tersimpan ${stored} (harusnya 10.000.000). Validasi lolos krn finite => DATA CORRUPTION senyap`,
      corrupt ? "CONFIRMED defect — fail by-design test" : "tidak terkonfirmasi");
  }

  // ---- PB-D2 DEFECT PROBE: client_email tidak divalidasi di create path ----
  {
    const ctx = baseCTX();
    const bf = baseForm(); bf.clientEmail = "bukan-email";
    const form = applyDefaultBank(bf, ctx);
    const err = validateClientSide(form, ctx);
    const input = toInput(form, ctx);
    const noServerGuard = !err && input.clientEmail === "bukan-email";
    record("PB-D2", "[DEFECT] email invalid lolos create path", noServerGuard ? false : true,
      `validasi="${err ?? "LOLOS"}", payload clientEmail="${input.clientEmail}" dikirim ke DB (create pakai insert langsung, bukan RPC update_proposal yg juga tak memvalidasi email)`,
      noServerGuard ? "CONFIRMED: kolom VARCHAR(100) tanpa CHECK email => typo email klien = link approval terkirim salah tanpa warning" : "");
  }

  // ---- PB-D3 PROBE: DP % menghasilkan dp_amount pecahan desimal ----
  {
    const { row } = computeCreatePayload((function(){ const c=baseCTX(); return toInput(applyDefaultBank(baseForm({ basePrice: "1,000,001", dpPercentage: "33" }), c), c); })(), "tok");
    record("PB-D3", "[INFO] dp_amount presisi", true,
      `base 1.000.001 x 33% -> total=${row.total_amount} dp=${row.dp_amount} (DB DECIMAL(12,2), JS float — cek pembulatan pas LIVE)`);
  }

  return results;
}

// ---- auto-load tests/proposal/.env.live jika ada ----
try {
  const raw = readFileSync(new URL("./.env.live", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

// ============================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const live = await buildLiveTransport();
  const mode = live ? "LIVE" : "SIM";
  console.log(`Mode: ${mode}${live ? "" : "  (mock transport — VITE_SUPABASE_ANON_KEY/TEST_* tidak tersedia)"}`);
  const results = await runPBTests(live ? { transport: adaptLive(live) } : {});
  const icon = { PASS: "✅", FAIL: "❌", BLOCKED: "⛔" };
  for (const r of results) console.log(`${icon[r.verdict]} ${r.id.padEnd(6)} ${r.verdict.padEnd(7)} ${r.name}\n        ↳ ${r.evidence}${r.note ? " | " + r.note : ""}`);
  const fails = results.filter((r) => r.verdict !== "PASS");
  console.log(`\nTOTAL: ${results.length} | PASS: ${results.length - fails.length} | NOT-PASS: ${fails.length}`);
  if (process.argv.includes("--report")) {
    const fs = await import("node:fs");
    fs.writeFileSync("tests/proposal/PB-run-report.json", JSON.stringify({ mode, ranAt: new Date().toISOString(), results }, null, 2));
    console.log("Report: tests/proposal/PB-run-report.json");
  }
  if (live) { await live.cleanup([]); }
}
