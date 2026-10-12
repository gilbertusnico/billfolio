// PE LIVE: edit guards against real DB (update_proposal RPC, migration 0028)
import fs from "fs";
import { env, Rest, login, uuid } from "./live-lib.mjs";
const authed = await login().then(s => new Rest(s.accessToken));
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
const results = [];
const rec = (id,name,status,detail)=>{results.push({id,name,status,detail});console.log(`${status==="PASS"?"✅":status==="FINDING"?"🔎":"❌"} ${id} ${name} :: ${String(detail).slice(0,180)}`);};

const SEED = await login(); const USER_ID = SEED.userId;
const wsList = (await authed.select("companies","select=id,name,owner_id,deleted_at&deleted_at=is.null")).json;
const WS = wsList.find(w=>w.owner_id===USER_ID) || wsList[0];
const OTHER_WS = wsList.filter(w=>w.id!==WS.id)[0] || null;
const clients = (await authed.select("clients",`company_id=eq.${WS.id}&limit=5`)).json;
const CLIENT = clients[0];
const banks = (await authed.select("bank_accounts",`company_id=eq.${WS.id}&limit=5`)).json;
const BANK = banks[0];

async function seed(status="DRAFT",{withInvoice=false}={}) {
  const token = uuid();
  const ins = await authed.insert("proposals",{
    agency_id:USER_ID, company_id:WS.id, client_id:CLIENT?.id??null, token,
    title:`SIT-PE ${token.slice(0,8)}`, client_name:CLIENT?.name||"SIT", client_email:CLIENT?.email||"sit@x.local",
    base_price:10000000, dp_percentage:50, status,
    payment_bank_account_id:BANK?.id??null, payment_bank_name:BANK?.name, payment_account_number:BANK?.account_number, payment_account_holder:BANK?.holder,
    agency_whatsapp_number:"628123", total_amount:10000000, dp_amount:5000000,
    ...(status==="APPROVED"?{approved_at:new Date().toISOString(),client_signature_url:`${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/${token}/signature.png`}:{}),
  });
  if(!ins.ok) throw new Error("seed fail "+ins.text.slice(0,150));
  const p = ins.json[0];
  await authed.insert("proposal_addons",[{proposal_id:p.id,title:"Old req",price:1000000,is_required:true,is_selected:true},{proposal_id:p.id,title:"Old opt",price:999999,is_required:false,is_selected:false}]);
  await authed.insert("proposal_milestones",[{proposal_id:p.id,title:"Old ms A",sort_order:0},{proposal_id:p.id,title:"Old ms B",sort_order:1}]);
  if(withInvoice){ // create DP invoice via real approve flow then flip back to SENT for the guard test? no - use ensure on APPROVED
  }
  return p;
}
const payload = (over={}) => ({ client_id:CLIENT?.id, title:"Edited title", client_name:"Edited Client", client_company:null, client_email:CLIENT?.email||"", project_summary:"edited", base_price:8000000, dp_percentage:40, payment_bank_account_id:BANK?.id, payment_bank_name:BANK?.name, payment_account_number:BANK?.account_number, payment_account_holder:BANK?.holder, agency_whatsapp_number:"628123", ...over });
const addons = (a=[{title:"New req",price:2000000,is_required:true},{title:"New opt",price:500000,is_required:false}]) => a.map(x=>({title:x.title,description:null,price:x.price,is_required:!!x.is_required}));
const mss = (m=[{title:"Ms1"},{title:"Ms2"},{title:"Ms3"}]) => m.map(x=>({title:x.title,description:null}));
const upd = (id,ws,p,ad,ms) => authed.rpc("update_proposal",{p_proposal_id:id,p_agency_id:USER_ID,p_workspace_id:ws,p_payload:p,p_addons:ad,p_milestones:ms});

const cleanup=[]; const invCleanup=[];
try {
// PE-01 happy path DRAFT
{
  const s = await seed(); cleanup.push(s.id);
  const r = await upd(s.id, WS.id, payload(), addons(), mss());
  const ok = (r.status===200||r.status===204) && !r.json?.error;
  rec("PE-01","Edit DRAFT via update_proposal succeeds", ok?"PASS":"FAIL", JSON.stringify(r.json??r.text).slice(0,150));
  const p = (await authed.select("proposals",`id=eq.${s.id}&select=title,base_price,total_amount,dp_amount,updated_at`)).json[0];
  rec("PE-01b","Recalc total=10jt dp=4jt (8jt+2jt req @40%)", Number(p.total_amount)===10000000&&Number(p.dp_amount)===4000000&&p.title==="Edited title"?"PASS":"FAIL", JSON.stringify(p));
  const ad = (await authed.select("proposal_addons",`proposal_id=eq.${s.id}&order=created_at`)).json;
  rec("PE-02","Delete-and-reinsert: only NEW addons exist", ad.length===2&&ad.every(a=>a.title.startsWith("New"))&&ad.find(a=>a.title==="New req")?.is_selected===true&&ad.find(a=>a.title==="New opt")?.is_selected===false?"PASS":"FAIL", JSON.stringify(ad.map(a=>[a.title,a.is_selected])));
  const ms = (await authed.select("proposal_milestones",`proposal_id=eq.${s.id}&order=sort_order&select=title,sort_order`)).json;
  rec("PE-03","Milestones replaced, sort_order 0..2 contiguous", ms.length===3&&ms.map(m=>m.sort_order).join()==="0,1,2"?"PASS":"FAIL", JSON.stringify(ms));
  // idempotent re-edit
  const r2 = await upd(s.id, WS.id, payload({title:"Edited title v2"}), addons(), mss());
  rec("PE-04","Second edit succeeds (re-editable)", (r2.status===200||r2.status===204)?"PASS":"FAIL", JSON.stringify(r2.json??r2.text).slice(0,120));
}
// PE-05/06 blocked statuses
{
  const ap = await seed("APPROVED"); cleanup.push(ap.id);
  const r = await upd(ap.id, WS.id, payload(), addons(), mss());
  rec("PE-05","Edit APPROVED rejected by RPC", r.status>=400&&/no longer/.test(JSON.stringify(r.json))?"PASS":"FAIL", JSON.stringify(r.json).slice(0,140));
  rec("PE-06","Edit PAID rejected (by-code: RPC checks IN ('APPROVED','PAID') OR dp_invoice_id IS NOT NULL)","INFO", "PAID unreachable in app (dead state, see REG-06); APPROVED branch proven in PE-05");
  // PE-07 empty title
  const s7 = await seed(); cleanup.push(s7.id);
  let rr = await upd(s7.id, WS.id, payload({title:"   "}), addons(), mss());
  rec("PE-07","Empty title rejected (22023)", rr.status>=400&&/title/i.test(JSON.stringify(rr.json))?"PASS":"FAIL", JSON.stringify(rr.json).slice(0,120));
  // PE-08 DP out of range
  rr = await upd(s7.id, WS.id, payload({dp_percentage:0}), addons(), mss());
  const rB = await upd(s7.id, WS.id, payload({dp_percentage:101}), addons(), mss());
  rec("PE-08","DP 0 and 101 both rejected", rr.status>=400&&rB.status>=400?"PASS":"FAIL", `0->${rr.status} ${JSON.stringify(rr.json).slice(0,60)} | 101->${rB.status}`);
  // PE-09 negative base
  rr = await upd(s7.id, WS.id, payload({base_price:-5}), addons(), mss());
  rec("PE-09","Negative base price rejected", rr.status>=400?"PASS":"FAIL", JSON.stringify(rr.json).slice(0,120));
  // PE-10 addon empty title
  rr = await upd(s7.id, WS.id, payload(), [{title:"",price:1,is_required:false}], mss());
  rec("PE-10","Addon with empty title rejected", rr.status>=400&&/add-on/i.test(JSON.stringify(rr.json))?"PASS":"FAIL", JSON.stringify(rr.json).slice(0,120));
  // PE-11 atomicity: bad milestone AFTER valid addons -> nothing persisted
  const before = (await authed.select("proposal_addons",`proposal_id=eq.${s7.id}&select=title`)).json.map(a=>a.title);
  rr = await upd(s7.id, WS.id, payload(), addons([{title:"ShouldNotPersist",price:1,is_required:true}]), [{title:"  "}]);
  const after = (await authed.select("proposal_addons",`proposal_id=eq.${s7.id}&select=title`)).json.map(a=>a.title);
  const still = (await authed.select("proposals",`id=eq.${s7.id}&select=total_amount`)).json[0];
  rec("PE-11","Atomic rollback: failed edit leaves addons+total untouched", JSON.stringify(before)===JSON.stringify(after)&&Number(still.total_amount)===10000000?"PASS":"FAIL", `before=${before} after=${after} total=${still.total_amount} err=${JSON.stringify(rr.json).slice(0,80)}`);
}
// PE-12 cross-workspace
{
  const s = await seed(); cleanup.push(s.id);
  const otherWs = OTHER_WS ? OTHER_WS.id : uuid();
  const r = await upd(s.id, otherWs, payload(), addons(), mss());
  rec("PE-12","Wrong workspace_id -> 'not found in this workspace'", r.status>=400&&/not found/i.test(JSON.stringify(r.json))?"PASS":"FAIL", JSON.stringify(r.json).slice(0,120)+(OTHER_WS?" (real other ws)":" (random uuid)"));
  // PE-13 client from another workspace
  if (OTHER_WS) {
    const oc = (await authed.select("clients",`company_id=eq.${OTHER_WS.id}&limit=1`)).json[0];
    if (oc) {
      const r2 = await upd(s.id, WS.id, payload({client_id:oc.id}), addons(), mss());
      rec("PE-13","Client outside target workspace rejected", r2.status>=400&&/workspace/i.test(JSON.stringify(r2.json))?"PASS":"FAIL", JSON.stringify(r2.json).slice(0,120));
    } else rec("PE-13","Client outside workspace rejected","BLOCKED","other ws has no clients readable");
  } else rec("PE-13","Client outside workspace rejected","BLOCKED","user has only 1 workspace");
}
// PE-14 anon call
{
  const s = await seed(); cleanup.push(s.id);
  const r = await anon.rpc("update_proposal",{p_proposal_id:s.id,p_agency_id:USER_ID,p_workspace_id:WS.id,p_payload:payload(),p_addons:addons(),p_milestones:mss()});
  rec("PE-14","Anon cannot call update_proposal (grant revoked)", r.status>=400?"PASS":"FAIL", `HTTP ${r.status} ${JSON.stringify(r.json).slice(0,120)}`);
  // PE-15 spoof p_agency_id
  const r2 = await authed.rpc("update_proposal",{p_proposal_id:s.id,p_agency_id:uuid(),p_workspace_id:WS.id,p_payload:payload(),p_addons:addons(),p_milestones:mss()});
  rec("PE-15","Spoofed p_agency_id != auth.uid() rejected", r2.status>=400&&/authorized/i.test(JSON.stringify(r2.json))?"PASS":"FAIL", JSON.stringify(r2.json).slice(0,120));
  // PE-16 direct REST bypass
  const r3 = await authed.update("proposals",`id=eq.${s.id}`,{title:"HACKED-DIRECT",total_amount:1});
  rec("PE-16","Direct REST PATCH still allowed (bypasses update_proposal validation)","FINDING", r3.ok? `PATCH succeeded HTTP ${r3.status} -> RLS allows raw writes; RPC guards (status/title/dp) NOT enforced if UI bug/curl used`:`blocked HTTP ${r3.status}`);
  await authed.del("proposals",`id=eq.${s.id}`).catch(()=>{});
}
// PE-17 real approved-with-invoice block + signature immutability
{
  const s = await seed("SENT"); cleanup.push(s.id);
  const sig=`${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/${s.token}/signature.png`;
  const ap = await anon.rpc("respond_to_proposal",{p_token:s.token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:sig});
  if(ap.json?.ok){ invCleanup.push(ap.json.invoice_id);
    const r = await upd(s.id, WS.id, payload(), addons(), mss());
    rec("PE-17","Edit after REAL approve (has dp_invoice_id) rejected twice-guarded", r.status>=400?"PASS":"FAIL", JSON.stringify(r.json).slice(0,140));
    // PE-18 client responds again? already covered CP-22. Check dashboard-side fetchAgencyProposal returns children ordered by created_at -> FINDING if stable order issue.
    const ch = (await authed.select("proposal_addons",`proposal_id=eq.${s.id}&order=created_at&select=title,created_at`)).json;
    rec("PE-18","Child ordering by created_at (builder prefill) - ties possible same-ms insert","INFO", `n=${ch.length} distinct_ts=${new Set(ch.map(c=>c.created_at)).size}`);
  } else rec("PE-17","approve setup failed","FAIL", JSON.stringify(ap.json).slice(0,120));
}
} finally {
  if(cleanup.length){const d=await authed.del("proposals",`id=in.(${cleanup.join(",")})`);console.log(`CLEANUP proposals x${cleanup.length}: HTTP ${d.status}`);}
  if(invCleanup.length){const d=await authed.del("invoices",`id=in.(${invCleanup.join(",")})`);console.log(`CLEANUP invoices x${invCleanup.length}: HTTP ${d.status}`);}
  const left=(await authed.select("proposals","title=like.SIT-PE*&select=id")).json; console.log("leftover SIT-PE:",left.length);
  const pass=results.filter(r=>r.status==="PASS").length;
  console.log(`\nTOTAL ${results.length} | PASS ${pass} | FAIL ${results.filter(r=>r.status==="FAIL").length} | FINDING/INFO/BLOCKED ${results.filter(r=>!/PASS|FAIL/.test(r.status)).length}`);
  fs.writeFileSync(new URL("./PE-live-report.json",import.meta.url),JSON.stringify(results,null,1));
}
