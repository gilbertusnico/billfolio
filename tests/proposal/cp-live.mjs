// CP LIVE: full client lifecycle against real DB (anon role, like a real client)
import fs from "fs";
import { env, Rest, login, uuid } from "./live-lib.mjs";
const anon = new Rest(env.VITE_SUPABASE_ANON_KEY);
const authed = await login().then(s => new Rest(s.accessToken));
const results = [];
const rec = (id, name, status, detail) => { results.push({id,name,status,detail}); console.log(`${status==="PASS"?"✅":"❌"} ${id} ${name} :: ${String(detail).slice(0,200)}`); };

// ---- seed helpers (agency side, mirrors createProposal/markProposalSent in src/lib/proposal.ts)
const SESS = await login(); const USER = { id: SESS.userId };
async function seedProposal({ addons, milestones = [{title:"Kickoff"}], basePrice=10000000, dpPct=50 }) {
  const ws = (await authed.select("companies","select=id,owner_id&deleted_at=is.null&owner_id=eq."+USER.id)).json[0];
  const clients = await authed.select("clients",`select=id,name,email&company_id=eq.${ws.id}&limit=1`);
  let client = clients.json?.[0];
  if (!client) {
    const ins = await authed.insert("clients",{company_id:ws.id,name:"SIT Client",email:"sit@testing.local"});
    client = ins.json?.[0] ?? (await authed.select("clients",`company_id=eq.${ws.id}&name=eq.SIT Client&select=*&limit=1`)).json[0];
  }
  const banks = await authed.select("bank_accounts",`company_id=eq.${ws.id}&limit=1`);
  const bank = banks.json[0];
  const token = uuid();
  const initialTotal = basePrice + addons.filter(a=>a.isRequired).reduce((t,a)=>t+a.price,0);
  const user = USER;
  const ins = await authed.insert("proposals", {
    agency_id: user.id, company_id: ws.id, client_id: client?.id ?? null, token,
    title: `SIT-CP ${token.slice(0,8)}`, client_name: client.name, client_company: client.company||null,
    client_email: client.email, project_summary: "SIT lifecycle test",
    base_price: basePrice, dp_percentage: dpPct,
    payment_bank_name: bank.name, payment_bank_account_id: bank.id,
    payment_account_number: bank.account_number, payment_account_holder: bank.holder,
    agency_whatsapp_number: user.user_metadata?.whatsapp_number || user.user_metadata?.phone || "628123",
    status: "DRAFT", total_amount: initialTotal, dp_amount: initialTotal*(dpPct/100),
  });
  if (!ins.ok) throw new Error("seed insert failed: "+ins.text.slice(0,200));
  const p = ins.json[0];
  await authed.insert("proposal_addons", addons.map(a=>({proposal_id:p.id,title:a.title,description:a.desc||null,price:a.price,is_required:!!a.isRequired,is_selected:!!a.isRequired})));
  await authed.insert("proposal_milestones", milestones.map((m,i)=>({proposal_id:p.id,title:m.title,sort_order:i})));
  return { proposal: p, token, client, bank, user, ws };
}
const markSent = (id) => authed.update("proposals",`id=eq.${id}&status=eq.DRAFT`,{status:"SENT"});

const cleanup = [];
try {
// ================= CP core =================
// CP-01/02/04 get_public_proposal DRAFT & SENT visibility
{
  const s = await seedProposal({addons:[{title:"Req addon",price:2000000,isRequired:true},{title:"Opt addon",price:1500000}]});
  cleanup.push(s.proposal.id);
  let r = await anon.rpc("get_public_proposal",{p_token:s.token});
  rec("CP-04b","DRAFT visible via link (spec: by-design; DEF-02 risk)", r.json? "PASS":"FAIL", `HTTP ${r.status}, data=${r.json?"PRESENT":"null"} -> early-link exposure confirmed`);
  await markSent(s.proposal.id);
  r = await anon.rpc("get_public_proposal",{p_token:s.token});
  const g = r.json; const P = g?.proposal || {};
  const okShape = P.status==="SENT" && Array.isArray(g.addons) && g.addons.length===2 && Array.isArray(g.milestones) && Number(P.total_amount)===12000000 && Number(P.dp_amount)===6000000;
  rec("CP-01","Client fetch via RPC (anon)", okShape?"PASS":"FAIL", `status=${P.status} addons=${g?.addons?.length} total=${P.total_amount} dp=${P.dp_amount}`);
  const leaks = ["agency_id","company_id","client_id","payment_bank_account_id"].filter(k=>k in P);
  rec("CP-02","Tenant-internal IDs not exposed via RPC", leaks.length===0?"PASS":"FAIL", `keys=${Object.keys(P).join(",")} | leak=${leaks.join(",")||"none"} (note: dp_invoice_id+token present BY DESIGN for View-invoice link)`);
  // CP-04 invalid token
  const bad = await anon.rpc("get_public_proposal",{p_token:uuid()});
  rec("CP-04","Unknown token -> null", bad.status===200 && bad.json===null?"PASS":"FAIL", `HTTP ${bad.status} body=${JSON.stringify(bad.json)}`);
  // CP-09 required addon locked
  const req = g?.addons?.find(a=>a.is_required);
  rec("CP-09","Required addon present+selected", req&&req.is_selected?"PASS":"FAIL", JSON.stringify(req));
  global.__s1 = s;
}
// ================= CP approve happy path =================
{
  const s = global.__s1;
  const opt = s && null; // re-fetch fresh
  const g = (await anon.rpc("get_public_proposal",{p_token:s.token})).json;
  const optAddon = g.addons.find(a=>!a.is_required);
  const sigUrl = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/${s.token}/signature.png`;
  const r = await anon.rpc("respond_to_proposal",{p_token:s.token,p_response:"APPROVED",p_selected_addon_ids:[optAddon.id],p_signature_url:sigUrl});
  const ok = r.status===200 && r.json?.ok===true && r.json?.invoice_id;
  rec("CP-15","Approve w/ optional addon -> RPC ok + invoice_id", ok?"PASS":"FAIL", JSON.stringify(r.json||r.text).slice(0,160));
  if (ok) {
    // DB asserts
    const pr = await authed.select("proposals",`id=eq.${s.proposal.id}&select=status,total_amount,dp_amount,approved_at,client_signature_url,dp_invoice_id`);
    const p = pr.json?.[0];
    if(!p){rec("CP-16","DB assert readback FAILED", "FAIL", pr.text.slice(0,150));} else {
    rec("CP-16","Status APPROVED + approved_at + signature url stored", p.status==="APPROVED"&&p.approved_at&&p.client_signature_url===sigUrl&&p.dp_invoice_id?"PASS":"FAIL", JSON.stringify(p).slice(0,200));
    rec("CP-16b","Recalc total=13.5jt dp=6.75jt", Number(p.total_amount)===13500000&&Number(p.dp_amount)===6750000?"PASS":"FAIL", `total=${p.total_amount} dp=${p.dp_amount}`);
    const sel = (await authed.select("proposal_addons",`proposal_id=eq.${s.proposal.id}&id=eq.${optAddon.id}&select=is_selected`)).json[0];
    rec("CP-16c","Optional addon is_selected=true server-side", sel?.is_selected===true?"PASS":"FAIL", JSON.stringify(sel));
    // invoice asserts
    const inv = (await authed.select("invoices",`id=eq.${p.dp_invoice_id}&select=*`)).json?.[0];
    const items = inv?.items || [];
    const dueOk = inv && Math.abs(new Date(inv.due_date) - (new Date(p.approved_at).getTime()+14*864e5)) <= 864e5;
    rec("CP-17","DP invoice created: number format/PENDING/due+14d", inv&&/^\w+\/.+\/\d+$/.test(inv.number||"")&&inv.status==="PENDING"&&dueOk?"PASS":"FAIL", `num=${inv?.number} status=${inv?.status} due=${inv?.due_date} approved=${p.approved_at.slice(0,10)}`);
    rec("CP-18","Invoice item 'DP <title> (50%)' amount=dp_amount", items.some(i=>/DP SIT-CP/.test(JSON.stringify(i))&&JSON.stringify(i).includes("6750000"))?"PASS":"FAIL", JSON.stringify(items).slice(0,220));
    rec("CP-19","Invoice subtotal/grand_total == dp_amount", inv&&Number(inv.subtotal)===6750000&&Number(inv.grand_total)===6750000?"PASS":"FAIL", `sub=${inv?.subtotal} grand=${inv?.grand_total} tax=${inv?.tax_amount} disc=${inv?.discount}`);
    rec("CP-19b","Invoice snapshots client+bank copied", inv&&inv.client_snapshot&&inv.bank_snapshot?"PASS":"FAIL", `client_snap=${!!inv?.client_snapshot} bank_snap=${!!inv?.bank_snapshot} bank_acc=${inv?.bank_account_id===s.bank.id?"same-as-proposal-snapshot":"DIFFERENT"}`);
    // idempotency
    const again = await anon.rpc("ensure_proposal_dp_invoice",{p_token:s.token});
    const againId = again.json?.invoice_id || again.json?.id || again.json?.proposal?.dp_invoice_id || (typeof again.json==="string"?again.json:null);
    const sameInv = againId===p.dp_invoice_id;
    rec("CP-20","ensure_proposal_dp_invoice idempotent (same invoice)", sameInv?"PASS":"FAIL", JSON.stringify(again.json||again.text).slice(0,140));
    const cnt = (await authed.select("proposals",`id=eq.${s.proposal.id}&select=dp_invoice_id`)).json[0];
    rec("CP-20b","Still exactly 1 invoice linked", cnt?.dp_invoice_id===p.dp_invoice_id?"PASS":"FAIL", "");
    // double approve race
    const d1 = await anon.rpc("respond_to_proposal",{p_token:s.token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:sigUrl});
    rec("CP-22","Double approve rejected after APPROVED", d1.status===200 && (d1.json?.ok===false||d1.json?.error||typeof d1.json==="boolean"&&d1.json===false)?"PASS":"FAIL", JSON.stringify(d1.json||d1.text).slice(0,140));
    // lock-after-response: sent->cannot respond
    // declined on separate proposal below
    // public view shows APPROVED + signature path
    const g2 = (await anon.rpc("get_public_proposal",{p_token:s.token})).json?.proposal || {};
    rec("CP-21","Public view after approve shows APPROVED + sig path", g2?.status==="APPROVED"&&g2?.client_signature_path?"PASS":"FAIL", `status=${g2?.status} sigpath=${g2?.client_signature_path} inv=${g2?.dp_invoice_id?"linked":"none"}`);
    }
    // storage: sig object doesn't exist (we faked URL) -> signed url should fail (app uses signedUrl not public)
    const pub = await fetch(sigUrl,{headers:{apikey:env.VITE_SUPABASE_ANON_KEY}});
    rec("CP-13x","Signature object NOT actually required by RPC (fake URL accepted)", pub.status!==200?"FINDING":"FINDING", `public GET=${pub.status} (NoSuchKey expected) but approve succeeded with fake URL -> server does not verify storage object exists`);
  }
}
// ================= CP decline + guards =================
{
  const s2 = await seedProposal({addons:[{title:"Only req",price:1000000,isRequired:true}],basePrice:5000000,dpPct:30});
  cleanup.push(s2.proposal.id);
  await markSent(s2.proposal.id);
  // decline without signature (0022 guard expects sig only for APPROVED)
  const dec = await anon.rpc("respond_to_proposal",{p_token:s2.token,p_response:"REJECTED",p_selected_addon_ids:[],p_signature_url:null});
  rec("CP-23","Decline succeeds w/o signature", dec.status===200 && (dec.json?.ok===true||dec.json===true)?"PASS":"FAIL", JSON.stringify(dec.json||dec.text).slice(0,140));
  const st = (await authed.select("proposals",`id=eq.${s2.proposal.id}&select=status,dp_invoice_id`)).json[0];
  rec("CP-24","REJECTED, no invoice generated", st.status==="REJECTED"&&!st.dp_invoice_id?"PASS":"FAIL", JSON.stringify(st));
  const dec2 = await anon.rpc("respond_to_proposal",{p_token:s2.token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:`${env.VITE_SUPABASE_URL}/storage/v1/object/public/proposal-assets/signatures/${s2.token}/signature.png`});
  rec("CP-25","Respond after REJECTED blocked", (dec2.json?.ok===false||dec2.json===false)?"PASS":"FAIL", JSON.stringify(dec2.json||dec2.text).slice(0,140));
  // approve missing signature (guard)
  const s3 = await seedProposal({addons:[],basePrice:8000000,dpPct:25}); cleanup.push(s3.proposal.id);
  await markSent(s3.proposal.id);
  const nosig = await anon.rpc("respond_to_proposal",{p_token:s3.token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:null});
  rec("CP-11x","Approve WITHOUT signature rejected by DB guard", (nosig.json?.ok===false||nosig.json===false||nosig.status>=400)?"PASS":"FAIL", JSON.stringify(nosig.json||nosig.text).slice(0,140));
  // bogus signature url path
  const bogus = await anon.rpc("respond_to_proposal",{p_token:s3.token,p_response:"APPROVED",p_selected_addon_ids:[],p_signature_url:"https://evil.example.com/sig.png"});
  rec("CP-11y","Approve with FOREIGN signature URL rejected", (bogus.json?.ok===false||bogus.json===false||bogus.status>=400)?"PASS":"FAIL", JSON.stringify(bogus.json||bogus.text).slice(0,140));
  // bad response value
  const weird = await anon.rpc("respond_to_proposal",{p_token:s3.token,p_response:"MAYBE",p_selected_addon_ids:[],p_signature_url:null});
  rec("CP-x","Invalid p_response handled gracefully", weird.status<500?"PASS":"FAIL", `HTTP ${weird.status} ${JSON.stringify(weird.json).slice(0,100)}`);
}
} finally {
  if (cleanup.length) { const d = await authed.del("proposals",`id=in.(${cleanup.join(",")})`); console.log(`CLEANUP proposals x${cleanup.length}: HTTP ${d.status}`); }
  // cleanup orphan DP invoices created during SIT (invoices have no FK to proposals -> stay behind when proposal deleted = DEF-CP1)
  const oi = await authed.del("invoices","project_name=like.SIT-CP*&select=id,number");
  console.log(`CLEANUP orphan invoices: HTTP ${oi.status} ${(oi.text||"[]").slice(0,200)}`);
  const left = await authed.select("proposals","title=like.SIT-CP*&select=id");
  console.log("leftover SIT-CP rows:", left.json?.length ?? 0);
  const pass = results.filter(r=>r.status==="PASS").length;
  console.log(`\nTOTAL ${results.length} | PASS ${pass} | FAIL ${results.filter(r=>r.status==="FAIL").length} | INFO/FINDING ${results.filter(r=>!/PASS|FAIL/.test(r.status)).length}`);
  fs.writeFileSync(new URL("./CP-live-report.json",import.meta.url), JSON.stringify(results,null,1));
}
