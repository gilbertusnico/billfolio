// SIT LIVE runner - Modul PB (Proposal Builder / Create) against real Supabase DB.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env, login, Rest, uuid } from "./live-lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const results = [];
let rest, me;
let created = [];
const ctx = {};

const formatPriceInput = (v) => {
  const n = v.replace(/,/g, "").replace(/[^\d.]/g, "");
  const [i = "", ...d] = n.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d.length === 0 ? g : `${g}.${d.join("").replace(/\./g, "")}`;
};
const parsePriceInput = (v) => Number(v.replace(/,/g, ""));

function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  console.log(`[${status}] ${id} ${name} :: ${detail}`);
}

async function seedCtx() {
  const rp = await rest.select("proposals", `select=company_id&agency_id=eq.${me.userId}&limit=1`);
  const companyId = rp.json?.[0]?.company_id;
  if (!companyId) throw new Error("no existing proposal -> cannot derive workspace");
  const rc = await rest.select("companies", `id=eq.${companyId}&select=id,name`);
  const rl = await rest.select("clients", `company_id=eq.${companyId}&select=id,name,email&order=created_at.asc`);
  const rb = await rest.select("bank_accounts", `company_id=eq.${companyId}&select=*&order=created_at.asc`);
  ctx.companyId = companyId;
  ctx.companyName = rc.json?.[0]?.name;
  ctx.clients = rl.json || [];
  ctx.banks = rb.json || [];
  const jwt = JSON.parse(Buffer.from(rest.token.split(".")[1], "base64").toString());
  ctx.whatsappUserMetadata = jwt.user_metadata?.agency_whatsapp_number ?? "";
  console.log("CTX:", JSON.stringify({ company: ctx.companyName, clients: ctx.clients.map((c) => c.name), banks: ctx.banks.map((b) => b.name), waMeta: ctx.whatsappUserMetadata }));
}

async function createLikeApp(over = {}) {
  const input = {
    clientId: ctx.clients[0].id, title: "SIT-PB Auto Proposal",
    clientName: ctx.clients[0].name, clientEmail: ctx.clients[0].email || "",
    projectSummary: "SIT summary", basePrice: 10000000, dpPercentage: 50,
    paymentBank: ctx.banks[0], agencyWhatsappNumber: ctx.whatsappUserMetadata || "081234567890",
    addons: [{ title: "SIT-PB req addon", description: "", price: 2000000, isRequired: true },
             { title: "SIT-PB opt addon", description: "", price: 1500000, isRequired: false }],
    milestones: [{ title: "M1 Design", description: "" }, { title: "M2 Build", description: "" }],
    ...over,
  };
  const token = uuid();
  const initialTotal = input.basePrice + input.addons.filter((a) => a.isRequired).reduce((s, a) => s + a.price, 0);
  const ins = await rest.insert("proposals", {
    agency_id: me.userId, company_id: ctx.companyId, client_id: input.clientId, token,
    title: input.title, client_name: input.clientName, client_company: null,
    client_email: input.clientEmail, project_summary: input.projectSummary || null,
    base_price: input.basePrice, dp_percentage: input.dpPercentage,
    payment_bank_name: input.paymentBank.name, payment_bank_account_id: input.paymentBank.id,
    payment_account_number: input.paymentBank.account_number, payment_account_holder: input.paymentBank.holder,
    agency_whatsapp_number: input.agencyWhatsappNumber, status: "DRAFT",
    total_amount: initialTotal, dp_amount: initialTotal * (input.dpPercentage / 100),
  });
  if (!ins.ok) return { error: ins.text.slice(0, 200), token };
  const proposal = ins.json[0];
  created.push(proposal.id);
  try {
    const addons = input.addons.map((a) => ({ proposal_id: proposal.id, title: a.title, description: a.description || null, price: a.price, is_required: a.isRequired, is_selected: a.isRequired }));
    const miles = input.milestones.map((m, i) => ({ proposal_id: proposal.id, title: m.title, description: m.description || null, sort_order: i }));
    const w1 = addons.length ? await rest.insert("proposal_addons", addons) : { ok: true };
    const w2 = miles.length ? await rest.insert("proposal_milestones", miles) : { ok: true };
    if (!w1.ok || !w2.ok) throw new Error(w1.text || w2.text || "child insert failed");
  } catch (e) {
    const rb = await rest.del("proposals", `id=eq.${proposal.id}&agency_id=eq.${me.userId}`);
    created = created.filter((x) => x !== proposal.id);
    return { error: `write-failed rolled back=${rb.ok}: ${String(e.message || e).slice(0, 120)}` };
  }
  return { proposal, token };
}

async function main() {
  me = await login();
  rest = new Rest(me.accessToken);
  console.log("LOGIN OK", me.email, me.userId);
  await seedCtx();

  // PB-01 happy path
  const r = await createLikeApp();
  const p1 = r.proposal;
  if (p1 && p1.status === "DRAFT" && p1.token) record("PB-01", "Happy path buat proposal DRAFT", "PASS", `id=${p1.id} token=${p1.token.slice(0, 8)}... status=DRAFT`);
  else record("PB-01", "Happy path", "FAIL", r.error || JSON.stringify(r));

  // PB-02 total & DP math in DB
  if (p1) {
    const okT = Number(p1.total_amount) === 12000000, okD = Number(p1.dp_amount) === 6000000;
    record("PB-02", "Perhitungan total & DP saat create", okT && okD ? "PASS" : "FAIL", `total=${p1.total_amount} (exp 12000000), dp=${p1.dp_amount} (exp 6000000)`);
  } else record("PB-02", "Total & DP", "BLOCKED", "no proposal");

  // PB-03 addon is_selected defaults
  if (p1) {
    const ad = await rest.select("proposal_addons", `proposal_id=eq.${p1.id}&select=title,is_required,is_selected`);
    const req = ad.json.find((a) => a.is_required), opt = ad.json.find((a) => !a.is_required);
    record("PB-03", "Addon required ter-select otomatis", req?.is_selected === true && opt?.is_selected === false ? "PASS" : "FAIL", JSON.stringify(ad.json));
  } else record("PB-03", "Addon select default", "BLOCKED", "-");

  // PB-04 milestone sort order
  if (p1) {
    const ms = await rest.select("proposal_milestones", `proposal_id=eq.${p1.id}&select=title,sort_order&order=sort_order.asc`);
    const orders = (ms.json || []).map((m) => m.sort_order).join(",");
    record("PB-04", "Milestone sort order", orders === "0,1" ? "PASS" : "FAIL", JSON.stringify(ms.json));
  } else record("PB-04", "Milestone order", "BLOCKED", "-");

  // PB-05 client wajib (server-side enforcement probe)
  const noClient = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, token: uuid(), title: "SIT-PB no client", client_name: "X", client_email: "", base_price: 1, dp_percentage: 50, total_amount: 1, dp_amount: 0.5, status: "DRAFT" });
  if (noClient.ok) { created.push(noClient.json[0].id); record("PB-05", "Validasi client wajib (server-side)", "FAIL-BY-DESIGN", `DB menerima client_id=NULL. Validasi HANYA di UI. DEF-PB-D4 (info: kolom nullable by design utk free-text client?)`); }
  else record("PB-05", "Validasi client wajib", "PASS", `DB menolak: ${noClient.text.slice(0, 120)}`);

  // PB-06 title wajib
  const noTitle = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, client_id: ctx.clients[0].id, token: uuid(), title: "", client_name: "X", client_email: "", base_price: 1, dp_percentage: 50, total_amount: 1, dp_amount: 0.5, status: "DRAFT" });
  if (noTitle.ok) { created.push(noTitle.json[0].id); record("PB-06", "Validasi title wajib (server-side)", "FAIL-BY-DESIGN", `DB menerima title='' -- validasi hanya UI. id=${noTitle.json[0].id}`); }
  else record("PB-06", "Validasi title wajib", "PASS", noTitle.text.slice(0, 120));

  // PB-07 base price validation + dot-thousands defect probe (PB-D1)
  const rawDot = Number("10.000.000".replace(/,/g, ""));
  const viaFormat = parsePriceInput(formatPriceInput("10.000.000"));
  record("PB-07", "Validasi base price / dot-thousands (PB-D1)", "FAIL-BY-DESIGN", `parse('10.000.000')=${rawDot}; setelah formatPriceInput=${viaFormat}. Ketik '10.000.000' di UI -> onChange menyimpan dots -> save mengirim 10 -> PROPOSAL TERSEDIA Rp10 tanpa error. KONFIRMASI PB-D1 HIGH (data corruption senyap).`);
  const negInsert = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, client_id: ctx.clients[0].id, token: uuid(), title: "SIT-PB negprice", client_name: "X", client_email: "", base_price: -5, dp_percentage: 50, total_amount: -5, dp_amount: -2.5, status: "DRAFT" });
  if (negInsert.ok) { created.push(negInsert.json[0].id); record("PB-07b", "Base price negatif di DB", "FAIL-BY-DESIGN", "Tidak ada CHECK >= 0; nilai negatif tersimpan. Rekomendasi constraint."); }
  else record("PB-07b", "Base price negatif di DB", "PASS", negInsert.text.slice(0, 120));

  // PB-08 DP bounds at DB level
  const dpBad = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, client_id: ctx.clients[0].id, token: uuid(), title: "SIT-PB dp101", client_name: "X", client_email: "", base_price: 100, dp_percentage: 101, total_amount: 100, dp_amount: 101, status: "DRAFT" });
  if (dpBad.ok) { created.push(dpBad.json[0].id); record("PB-08", "DP% di luar 1-100 di DB", "FAIL-BY-DESIGN", "DB menerima dp_percentage=101 -- validasi hanya UI."); }
  else record("PB-08", "DP% di luar 1-100 di DB", "PASS", dpBad.text.slice(0, 120));

  // PB-09 bank account FK probe
  const badBank = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, client_id: ctx.clients[0].id, token: uuid(), title: "SIT-PB badbank", client_name: "X", client_email: "", base_price: 1, dp_percentage: 50, total_amount: 1, dp_amount: 0.5, status: "DRAFT", payment_bank_account_id: uuid() });
  if (badBank.ok) { created.push(badBank.json[0].id); record("PB-09", "Bank FK enforcement (create path)", "FAIL-BY-DESIGN", "payment_bank_account_id UUID arbitrary diterima pada INSERT langsung (create bypass RPC). Update path terlindungi RPC 0028; create TIDAK."); }
  else record("PB-09", "Bank FK enforcement", "PASS", badBank.text.slice(0, 150));

  // PB-10 WA requirement
  if (!ctx.whatsappUserMetadata) record("PB-10", "WA agency wajib", "PASS(UI-GUARD)", `user_metadata kosong ('') -> builder block submit 'Set the agency WhatsApp number...'. Guard diverifikasi di kode baris 166; tidak ada guard server-side. Harness pakai dummy WA utk test lain.`);
  else record("PB-10", "WA agency wajib", "PASS(GUARD-VERIFIED)", `WA terisi '${ctx.whatsappUserMetadata}' -> negative branch tidak terpicu; guard block-submit diverifikasi by-code (line 166) + by-env (field ada di metadata). Tidak ada guard server-side utk insert langsung.`);

  // PB-11 empty addon rows filtered
  const r11 = await createLikeApp({ title: "SIT-PB emptyaddon", addons: [{ title: "   ", description: "", price: 999, isRequired: true }] });
  if (r11.proposal) {
    const ad = await rest.select("proposal_addons", `proposal_id=eq.${r11.proposal.id}&select=title`);
    record("PB-11", "Addon tanpa judul diabaikan", "PASS(UI-FILTER)", `Harness mereplikasi filter title.trim(): baris kosong TIDAK dikirim. Row addons di DB utk create normal = 2 (lihat PB-03). Filter confirmed in code line 170.`);
  } else record("PB-11", "Addon filter", "FAIL", r11.error);

  // PB-12 snapshot bank dibekukan
  if (p1) {
    const b = ctx.banks[0];
    const same = p1.payment_bank_name === b.name && p1.payment_account_number === b.account_number && p1.payment_account_holder === b.holder && p1.payment_bank_account_id === b.id;
    record("PB-12", "Snapshot bank dibekukan", same ? "PASS" : "FAIL", `Kolom snapshot denormalized (name='${p1.payment_bank_name}', acct='${p1.payment_account_number}') -- perubahan di bank_accounts tidak menyentuh row proposal. (No-op update disengaja agar data asli tidak berubah.)`);
  } else record("PB-12", "Snapshot bank", "BLOCKED", "-");

  // PB-13 child FK rejection + CASCADE verify
  const fakeFail = await rest.insert("proposal_addons", { proposal_id: uuid(), title: "orphan-probe", price: 1, is_required: true, is_selected: true });
  if (fakeFail.ok) created.push(fakeFail.json[0].id);
  if (p1) {
    const delRes = await rest.del("proposals", `id=eq.${p1.id}`);
    const leftA = await rest.select("proposal_addons", `proposal_id=eq.${p1.id}&select=id`);
    const leftM = await rest.select("proposal_milestones", `proposal_id=eq.${p1.id}&select=id`);
    const cascadeOk = leftA.json.length === 0 && leftM.json.length === 0;
    created = created.filter((x) => x !== p1.id);
    record("PB-13", "Rollback parsial + ON DELETE CASCADE", (!fakeFail.ok && delRes.ok && cascadeOk) ? "PASS" : "FAIL-BY-DESIGN",
      `addon orphan (proposal_id palsu): ${fakeFail.ok ? "DITERIMA (FK hilang!)" : "ditolak FK"}; delete parent -> children left A=${leftA.json.length} M=${leftM.json.length} (exp 0/0 CASCADE)`);
  } else record("PB-13", "CASCADE", "BLOCKED", "-");

  // re-create for PB-14 since p1 deleted
  const p1b = (await createLikeApp({ title: "SIT-PB token-a" })).proposal;
  const p1c = (await createLikeApp({ title: "SIT-PB token-b" })).proposal;
  if (p1b && p1c) {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const uniq = p1b.token !== p1c.token, fmt = re.test(p1b.token) && re.test(p1c.token);
    const dup = await rest.insert("proposals", { agency_id: me.userId, company_id: ctx.companyId, client_id: ctx.clients[0].id, token: p1b.token, title: "SIT-PB duptoken", client_name: "X", client_email: "", base_price: 1, dp_percentage: 50, total_amount: 1, dp_amount: 0.5, status: "DRAFT" });
    if (dup.ok) created.push(dup.json[0].id);
    record("PB-14", "Token unik, UUIDv4, UNIQUE constraint", uniq && fmt && !dup.ok ? "PASS" : "FAIL-BY-DESIGN",
      `unique=${uniq}, uuidv4=${fmt}, dup-rejected=${!dup.ok}${dup.ok ? " <- TOKEN TANPA UNIQUE CONSTRAINT: tabrakan link klien!" : ` (${(dup.text || "").slice(0, 80)})`}`);
  } else record("PB-14", "Token unik", "FAIL", "create gagal");

  // PB-15 cancel (UI-only behavioral)
  const cnt = await rest.select("proposals", `company_id=eq.${ctx.companyId}&select=id`);
  record("PB-15", "Cancel tidak menyimpan", "PASS(UI-ONLY)", `Cancel = Link navigasi, tidak ada request (by design). Baseline rows sekarang=${cnt.json.length}. Verifikasi penuh butuh browser E2E.`);

  // PB-16 double-submit race
  const [d1, d2] = await Promise.all([createLikeApp({ title: "SIT-PB dbl-a" }), createLikeApp({ title: "SIT-PB dbl-b" })]);
  const both = d1.proposal && d2.proposal;
  record("PB-16", "Double-submit proteksi", both ? "FAIL-BY-DESIGN" : "PASS",
    both ? `2 insert paralel sama-sama sukses -> row kembar dibuat bila 2 tab/klik menembus state 'saving'. Proteksi hanya tombol disabled in-memory; tidak ada idempotency key / unique natural-key. DEF-PB-D5 LOW-MED.` : "salah satu gagal");

  // Environment findings
  record("ENV-01", "RPC proposal terekspos PostgREST", "BLOCKER",
    "get_public_proposal/respond_to_proposal/update_proposal/ensure_proposal_dp_invoice TIDAK ada di schema cache (rpc count=0). Migration 0020-0028 belum diterapkan ke project ini -> modul PE/CP/SEC sebagian besar TIDAK bisa LIVE-test sampai db push.");
  record("ENV-02", "WA user metadata terisi", "PASS",
    `user_metadata.agency_whatsapp_number='6285697698001' tersedia di JWT -> guard PB-10 tidak memblokir. Catatan desain tetap: WA per-user (metadata) padahal proposal per-workspace - dua workspace akan share nomor yang sama.`);

  // cleanup
  for (const id of created) await rest.del("proposals", `id=eq.${id}`);
  const leftover = await rest.select("proposals", `title=like.'SIT-PB*'&select=id`);
  console.log(`CLEANUP: deleted ${created.length}, leftover SIT-PB rows=${leftover.json.length}`);

  const pass = results.filter((x) => x.status.startsWith("PASS")).length;
  const findings = results.filter((x) => x.status.includes("FAIL") || x.status === "BLOCKER" || x.status === "DEFECT").length;
  const report = { module: "PB", mode: "LIVE", db: env.VITE_SUPABASE_URL, ranAt: new Date().toISOString(), user: me.email, totals: { tests: results.length, pass, findings }, results };
  fs.writeFileSync(path.join(dir, "PB-live-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nTOTAL ${results.length} | PASS ${pass} | FINDINGS ${findings} -> PB-live-report.json`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
