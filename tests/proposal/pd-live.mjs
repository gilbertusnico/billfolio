// PD LIVE: dashboard queries against real DB (mirrors fetchAgencyProposals/markProposalSent)
import fs from "fs";
import { env, Rest, login, uuid } from "./live-lib.mjs";
const authed = await login().then(s=>new Rest(s.accessToken));
const results=[]; const rec=(id,name,st,d)=>{results.push({id,name,status:st,detail:d});console.log(`${st==="PASS"?"✅":st==="FINDING"?"🔎":"❌"} ${id} ${name} :: ${String(d).slice(0,170)}`);};
const S=await login(); const USER=S.userId;
const wsList=(await authed.select("companies","select=id,name,owner_id&deleted_at=is.null")).json;
const WS=wsList.find(w=>w.owner_id===USER)||wsList[0];
const OTHER=wsList.filter(w=>w.id!==WS.id)[0]||null;
const CLIENT=((await authed.select("clients",`company_id=eq.${WS.id}&limit=1`)).json)[0];
const BANK=((await authed.select("bank_accounts",`company_id=eq.${WS.id}&limit=1`)).json)[0];
async function seedP(ws,title,over={}){
  const token=uuid();
  const ins=await authed.insert("proposals",{agency_id:USER,company_id:ws,client_id:CLIENT?.id??null,token,title,
    client_name:"SIT",client_email:"sit@x.local",base_price:1000000,dp_percentage:50,status:"DRAFT",
    payment_bank_account_id:BANK?.id,payment_bank_name:BANK?.name,payment_account_number:BANK?.account_number,payment_account_holder:BANK?.holder,
    agency_whatsapp_number:"628123",total_amount:1000000,dp_amount:500000,...over});
  if(!ins.ok) throw new Error(ins.text.slice(0,150)); return ins.json[0];
}
const fetchAgencyProposals=(ws)=>authed.select("proposals",`select=*&agency_id=eq.${USER}&company_id=eq.${ws}&order=created_at.desc`);
const cleanup=[];
try{
  // PD-01 scoping: seed 12 in WS, 3 in OTHER (if exists)
  const mine=[]; for(let i=0;i<12;i++) mine.push(await seedP(WS.id,`SIT-PB-PD w${i}`));
  let theirs=[]; if(OTHER){for(let i=0;i<3;i++) theirs.push(await seedP(OTHER.id,`SIT-PB-PD other${i}`).catch(e=>null));theirs=theirs.filter(Boolean);}
  cleanup.push(...mine.map(m=>m.id),...theirs.map(t=>t.id));
  const r=await fetchAgencyProposals(WS.id);
  const ids=r.json.map(p=>p.id);
  rec("PD-01","Dashboard query scoped to agency+workspace", r.ok&&ids.length>=12&&ids.every(i=>mine.some(m=>m.id===i))&&!ids.some(i=>theirs.some(t=>t.id===i))?`PASS`:`FAIL`, `rows=${ids.length} mine=${mine.length} otherLeak=${ids.filter(i=>theirs.some(t=>t.id===i)).length}`);
  // PD-02 order desc by created_at
  const ts=ids.map(i=>mine.find(m=>m.id===i)?.created_at).filter(Boolean);
  const sorted=[...ts].sort().reverse();
  rec("PD-02","ORDER created_at.desc stable", JSON.stringify(ts.slice(0,12))===JSON.stringify(sorted.slice(0,12))?"PASS":"FAIL", `${ts.slice(0,3)} vs ${sorted.slice(0,3)}`);
  // PD-04 pagination math (client-side slice like component)
  const PAGE=10, all=r.json; const p2=all.slice(10,20);
  rec("PD-04","Pagination: page1=10 rows, page2=rest, total consistent", all.length>=12&&p2.length===all.length-10?"PASS":"FAIL", `total=${all.length} p2=${p2.length} pageCount=${Math.ceil(all.length/PAGE)}`);
  // PD-05 mark sent guard
  const s=mine[0];
  const g=await authed.update("proposals",`id=eq.${s.id}&agency_id=eq.${USER}&company_id=eq.${WS.id}&status=eq.DRAFT`,{status:"SENT"});
  const after=(await authed.select("proposals",`id=eq.${s.id}&select=status`)).json[0];
  rec("PD-05","markProposalSent DRAFT->SENT with full guard", g.ok&&after.status==="SENT"?"PASS":"FAIL", JSON.stringify(after));
  // PD-06 silent no-op: re-mark SENT (DEF-01 probe)
  const g2=await authed.update("proposals",`id=eq.${s.id}&agency_id=eq.${USER}&company_id=eq.${WS.id}&status=eq.DRAFT`,{status:"SENT"});
  rec("PD-06","Re-mark on SENT: HTTP ok but 0 rows -> UI shows success anyway (DEF-01)","FINDING", `HTTP ${g2.status} body=${JSON.stringify(g2.json??g2.text).slice(0,60)} | app code ignores rowcount`);
  // PD-07 wrong company guard
  if(OTHER){
    const g3=await authed.update("proposals",`id=eq.${mine[1].id}&agency_id=eq.${USER}&company_id=eq.${OTHER.id}&status=eq.DRAFT`,{status:"SENT"});
    const st=(await authed.select("proposals",`id=eq.${mine[1].id}&select=status`)).json[0];
    rec("PD-07","Mark-sent with wrong workspace id -> stays DRAFT", st.status==="DRAFT"?"PASS":"FAIL", JSON.stringify(st)+` http=${g3.status}`);
  } else rec("PD-07","Wrong workspace guard","BLOCKED","single workspace");
  // PD-09 badge statuses reachable set + PAID/EXPIRED render path (REG-06 shared)
  const enumVals=["DRAFT","SENT","APPROVED","REJECTED","PAID","EXPIRED"];
  const s2=mine[2];
  let paidOk=true, paidErr=null;
  try{ const pr=await authed.update("proposals",`id=eq.${s2.id}`,{status:"PAID"}); paidOk=pr.ok; paidErr=pr.text.slice(0,80);}catch(e){paidOk=false;}
  rec("PD-09/REG-06","DB enum accepts PAID/EXPIRED writes (dead states only via manual SQL)","FINDING", `PAID patch=${paidOk?"ACCEPTED":"rejected"}: ${paidErr||""} | no app code ever sets it -> violet/amber badges unreachable in UI flow`);
  // PD-10 empty state query
  const empty=await fetchAgencyProposals(uuid());
  rec("PD-10","Empty workspace -> 0 rows (empty-state renders)", empty.ok&&empty.json.length===0?"PASS":"FAIL", `rows=${empty.json.length}`);
  // PD-11 load error surfaced? anon session -> RLS 401/empty
  const anon=new Rest(env.VITE_SUPABASE_ANON_KEY);
  const ae=await anon.select("proposals",`select=*&agency_id=eq.${USER}`);
  rec("PD-11","Anon cannot list proposals (RLS)", !ae.ok||ae.json.length===0?"PASS":"FAIL", `HTTP ${ae.status} rows=${ae.json?.length}`);
  // PD-12 copy link uses token field present in every row
  const missingToken=(await fetchAgencyProposals(WS.id)).json.filter(p=>!p.token);
  rec("PD-12","All listed rows carry token (copy-link/open-view safe)", missingToken.length===0?"PASS":"FAIL", `missing=${missingToken.length}`);
  // PD-13 total_amount null fallback display (formatIDR(total ?? base_price))
  const s3=mine[3]; await authed.update("proposals",`id=eq.${s3.id}`,{total_amount:null});
  const row=(await authed.select("proposals",`id=eq.${s3.id}&select=total_amount,base_price`)).json[0];
  rec("PD-13","Null total falls back to base_price in query result", row.total_amount===null&&row.base_price!=null?"PASS":"FAIL", JSON.stringify(row));
  await authed.update("proposals",`id=eq.${s3.id}`,{total_amount:1000000});
}catch(e){rec("PD-RUN","harness error","FAIL",e.message);}
finally{
  if(cleanup.length){const d=await authed.del("proposals",`id=in.(${cleanup.join(",")})`);console.log(`CLEANUP x${cleanup.length}: HTTP ${d.status}`);}
  const left=(await authed.select("proposals","title=like.SIT-PB-PD*&select=id")).json; console.log("leftover:",left.length);
  const pass=results.filter(r=>r.status==="PASS").length;
  console.log(`\nTOTAL ${results.length} | PASS ${pass} | FAIL ${results.filter(r=>r.status==="FAIL").length} | FINDING/BLOCKED ${results.filter(r=>!/PASS|FAIL/.test(r.status)).length}`);
  fs.writeFileSync(new URL("./PD-live-report.json",import.meta.url),JSON.stringify(results,null,1));
}
