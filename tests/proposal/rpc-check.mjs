import { env, Rest } from "./live-lib.mjs";
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
const RPCS = ["get_public_proposal","respond_to_proposal","update_proposal","ensure_proposal_dp_invoice","can_upload_proposal_signature","can_read_approved_proposal_signature"];
for (const fn of RPCS) {
  const r = await anon.rpc(fn, {});
  const msg = r.json?.message || r.text.slice(0,120);
  const found = !(r.status===404 && /PGRST202|not found/.test(msg));
  console.log(`${found?"✅ FOUND ":"❌ MISSING"} ${fn} -> HTTP ${r.status} :: ${msg.slice(0,150)}`);
}
// also check tables/columns via authenticated later; quick anon table probe
for (const t of ["proposals","proposal_addons","proposal_milestones"]) {
  const r = await anon.select(t,"select=*&limit=1");
  console.log(`table ${t}: HTTP ${r.status} ${r.ok?JSON.stringify(r.json).slice(0,60):r.text.slice(0,100)}`);
}
