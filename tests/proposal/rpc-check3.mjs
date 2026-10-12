import { env, Rest, login } from "./live-lib.mjs";
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
// exact signatures used by the app:
const probes = [
  ["respond_to_proposal", { p_token:"00000000-0000-4000-8000-000000000000", p_response:"DECLINED", p_selected_addon_ids:[], p_signature_url:null }],
  ["update_proposal", { p_proposal_id:"00000000-0000-4000-8000-000000000000", p_agency_id:"00000000-0000-4000-8000-000000000000", p_workspace_id:"00000000-0000-4000-8000-000000000000", p_payload:{}, p_addons:[], p_milestones:[] }],
];
for (const [fn,args] of probes) {
  const r = await anon.rpc(fn,args);
  console.log(`anon ${fn}: HTTP ${r.status} :: ${(r.json?.message||JSON.stringify(r.json)||r.text).slice(0,160)}`);
}
const sess = await login();
const auth = new Rest(sess.accessToken);
for (const [fn,args] of probes) {
  const r = await auth.rpc(fn,args);
  console.log(`auth ${fn}: HTTP ${r.status} :: ${(r.json?.message||JSON.stringify(r.json)||r.text).slice(0,160)}`);
}
// check existing approved proposals have dp_invoice_id (migration 0025 applied?)
const p = await auth.select("proposals","select=id,status,title,token,total_amount,dp_amount,dp_invoice_id,approved_at&limit=10");
console.log("proposals:", JSON.stringify(p.json,null,1));
// check storage bucket exists
const b = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/00000000-0000-4000-8000-000000000000/signature.png`,{headers:{apikey:env.VITE_SUPABASE_ANON_KEY}});
console.log("bucket probe:", b.status, (await b.text()).slice(0,120));
