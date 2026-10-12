// REG-03 & REG-05 corrected re-run
import fs from "fs";
import { env, Rest, login, uuid } from "./live-lib.mjs";
const authed = await login().then(s=>new Rest(s.accessToken));
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
const results=[]; const rec=(id,n,st,d)=>{results.push({id,name:n,status:st,detail:d});console.log(`${st==="PASS"?"✅":st==="FINDING"?"🔎":"❌"} ${id} ${n} :: ${String(d).slice(0,170)}`);};
const S=await login(); const USER=S.userId;
const WS=((await authed.select("companies","select=id,owner_id&deleted_at=is.null")).json.find(w=>w.owner_id===USER)||{}); 
const CLIENT=((await authed.select("clients",`company_id=eq.${WS.id}&limit=1`)).json)[0];
const BANK=((await authed.select("bank_accounts",`company_id=eq.${WS.id}&limit=1`)).json)[0];

// full lifecycle -> DP invoice -> get_public_invoice(p_invoice_id) like app does
const token=uuid();
const ins=await authed.insert("proposals",{agency_id:USER,company_id:WS.id,client_id:CLIENT?.id,token,title:"SIT-REG2 lifecycle",
  client_name:CLIENT?.name||"X",client_email:CLIENT?.email||"x@x.local",base_price:4000000,dp_percentage:50,status:"SENT",
  payment_bank_account_id:BANK?.id,payment_bank_name:BANK?.name,payment_account_number:BANK?.account_number,payment_account_holder:BANK?.holder,
  agency_whatsapp_number:"628123",total_amount:4000000,dp_amount:2000000});
const p=ins.json[0];
const sig=`${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/${token}/signature.png`;
const ap=await anon.rpc("respond_to_proposal",{p_token:token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:sig});
if(ap.json?.ok){
  const pub=await anon.rpc("get_public_invoice",{p_invoice_id:ap.json.invoice_id});
  const inv=pub.json?.invoice||pub.json?.data?.invoice||null;
  rec("REG-03","DP invoice readable via get_public_invoice (public link works)", pub.status===200&&pub.json?"PASS":"FAIL", `HTTP ${pub.status} company=${!!pub.json?.company} hasInvoicePayload=${!!pub.json} keys=${Object.keys(pub.json||{}).join(",").slice(0,80)}`);
  // report-payment RPC still callable on DP invoice (existing flow) - just check it exists
  const rep=await anon.rpc("report_invoice_payment",{p_invoice_id:ap.json.invoice_id,p_note:"sit test"});
  rec("REG-03b","report_invoice_payment callable on DP invoice", rep.status<500?`INFO`:"FAIL", `HTTP ${rep.status} ${String(rep.text).slice(0,100)}`);
}else rec("REG-03","approve failed","FAIL",JSON.stringify(ap.json).slice(0,120));

// cleanup proposal first (SET NULL dp_invoice), then delete invoice
await authed.del("proposals",`id=eq.${p.id}`);
if(ap.json?.invoice_id) await authed.del("invoices",`id=eq.${ap.json.invoice_id}`);

// REG-05 correct assertion: expect success + SET NULL
const tc=await authed.insert("clients",{company_id:WS.id,name:"SIT-REG2 delme",email:"reg2del@x.local"});
const t=tc.json?.[0];
if(t){
  const t2=uuid();
  const p2=await authed.insert("proposals",{agency_id:USER,company_id:WS.id,client_id:t.id,token:t2,title:"SIT-REG2 clientdel",
    client_name:"X",client_email:"x@x.local",base_price:1,dp_percentage:50,status:"DRAFT",payment_bank_account_id:BANK?.id,payment_bank_name:BANK?.name,payment_account_number:BANK?.account_number,payment_account_holder:BANK?.holder,agency_whatsapp_number:"628",total_amount:1,dp_amount:0.5});
  const dc=await authed.del("clients",`id=eq.${t.id}`);
  const chk=dc.ok?(await authed.select("proposals",`id=eq.${p2.json[0].id}&select=client_id`)).json[0]:null;
  rec("REG-05","Delete referenced client -> proposal survives w/ client_id=NULL", dc.ok&&chk&&chk.client_id===null?"PASS":"FAIL", `delHTTP=${dc.status} client_id=${chk?.client_id}`);
  if(p2.json?.[0]) await authed.del("proposals",`id=eq.${p2.json[0].id}`);
}
const left=(await authed.select("proposals","title=like.SIT-REG2*&select=id")).json;
console.log("leftover:",left.length);
fs.writeFileSync(new URL("./REG-live-report.json",import.meta.url),JSON.stringify(results,null,1));
