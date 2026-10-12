import { env, Rest, login } from "./live-lib.mjs";
const authed = await login().then(s=>new Rest(s.accessToken));
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
// find an existing invoice in ws to test the real public-invoice RPC name/args
const invs=(await authed.select("invoices","select=id,number,share_link_generated_at&limit=3")).json;
console.log("invoices:",JSON.stringify(invs));
for (const fn of ["get_public_invoice"]) {
  const r=await anon.rpc(fn,{p_invoice_id:invs[0]?.id});
  console.log(fn,"(p_invoice_id) ->",r.status,String(r.text).slice(0,120));
}
