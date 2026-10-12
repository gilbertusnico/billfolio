import { env, Rest, login } from "./live-lib.mjs";
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
// call with plausible args to see if function exists (404 vs 401/200/error)
const probes = [
  ["get_public_proposal", { p_token: "00000000-0000-4000-8000-000000000000" }],
  ["respond_to_proposal", { p_token: "00000000-0000-4000-8000-000000000000", p_response: "DECLINED" }],
  ["update_proposal", {}],
  ["ensure_proposal_dp_invoice", { p_token: "00000000-0000-4000-8000-000000000000" }],
];
for (const [fn,args] of probes) {
  const r = await anon.rpc(fn,args);
  console.log(`anon ${fn}: HTTP ${r.status} :: ${(r.json?.message||r.text).slice(0,160)}`);
}
// authenticated probe
try {
  const sess = await login();
  const auth = new Rest(sess.accessToken);
  for (const [fn,args] of probes) {
    const r = await auth.rpc(fn,args);
    console.log(`auth ${fn}: HTTP ${r.status} :: ${(r.json?.message||r.text).slice(0,160)}`);
  }
  // list our proposals count
  const p = await auth.select("proposals","select=id,status,title&limit=5");
  console.log("auth proposals:", p.status, JSON.stringify(p.json).slice(0,300));
} catch(e){ console.log("login err:", e.message); }
