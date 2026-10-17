// 巷口小食記帳（獨立 app 版）— 帳存在 Google 試算表，手機上離線也能先記，有網路再自動傳上去
const API_URL = "https://script.google.com/macros/s/AKfycbx_lJFH3PPLeauWDsYj7fR4N60zBcOlwSEfLcyYxN-T1G-C0cQobNS5ZkScbcjx-fE-6A/exec";

const CATS = {
  // 類別和品項照天天記帳「巷口小食館」帳本實際用過的整理，品項依使用次數排序
  in: [
    {name:"現金收入", items:[]},
    {name:"LINE Pay", items:[]},
    {name:"台灣Pay", items:[]},
    {name:"全支付", items:[]},
    {name:"熊貓", items:["1-15 撥款","16-30 撥款"]},
    {name:"其他收入", items:["廢油","隔壁水電"]},
  ],
  out: [
    {name:"生鮮食材", items:["頭骨","地瓜葉","排骨肉","青菜","貢丸","肉燥","蒜碎/薑絲","麵條","粄條","蛋","餛飩肉","豬肉","雞腿","餛飩皮","水餃","海帶素肉","冬粉","筍乾"]},
    {name:"調味品/包材", items:["米","醬油","622餐盒","沙拉油","耐炸油","B膏","750碗","油蔥酥","油膏","地瓜粉","雞粉","洗碗精","3斤花袋","芝麻醬","850碗","花生醬","筷子","粿盒","520","雜項調味品","雜項用品"]},
    {name:"營業成本", items:["瓦斯","油資","熊貓抽成","熊貓月租費","店租","停車費","水費","電費","汽機車保養","電話網路","短少","雜項"]},
    {name:"生活開銷", home:true, items:["食材","飲料","晚餐","午餐","早餐","飲食","麵包","水果","醫療","藥品","咖啡","貓咪","保險","生活雜項","貸款","國民年金","房屋稅","地價稅","牌照稅","燃料稅","有線電視"]},
  ]
};
const PAYS = ["現金","轉帳","刷卡"];

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayStr = () => ymd(new Date());
const ymOf = s => s.slice(0,7);
const money = n => Math.round(n).toLocaleString("zh-TW");
const shiftYm = (ym,k) => { let [y,m]=ym.split("-").map(Number); m+=k; while(m<1){m+=12;y--} while(m>12){m-=12;y++} return y+"-"+pad(m); };
const ymLabel = ym => { const [y,m]=ym.split("-").map(Number); return (y-1911)+" 年 "+m+" 月"; };
const WD = "日一二三四五六";
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function lsGet(k,def){ try{ const v=localStorage.getItem(k); return v==null?def:JSON.parse(v); }catch(_){ return def; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} }

// ---------- 狀態 ----------
const S = {
  type:"out", cat:"生鮮食材", pay:"現金", who: lsGet("who",""),
  edit:null, delArm:false, manage:false,
  listYm: ymOf(todayStr()), repYm: ymOf(todayStr()), filter:"all",
  pin: lsGet("pin",""), sheetUrl: lsGet("sheetUrl",""),
  server: lsGet("months",{}),     // 從試算表拿到的帳（也存在手機，沒網路時照樣看得到）
  outbox: lsGet("outbox",[]),     // 還沒傳上去的動作
  extra: lsGet("extra",{in:[],out:[]}),
  online: true, syncing:false,
};
const catsOf = t => CATS[t].concat((S.extra[t])||[]);
let HOME = new Set();
function rebuildHome(){ HOME = new Set(catsOf("out").filter(c=>c.home).map(c=>c.name)); }
rebuildHome();
const isHome = e => e.type==="out" && HOME.has(e.cat);

function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,1800); }
function status(msg){ const b=$("status"); b.textContent=msg||""; b.hidden=!msg; }

// ---------- 連線 ----------
async function api(action, extra){
  const r = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(Object.assign({pin:S.pin, action}, extra||{}))});
  const j = await r.json();
  if(!j.ok){ const e=new Error(j.error||"server"); e.code=j.error; throw e; }
  return j;
}

function queue(op){ op.opId=uid(); S.outbox.push(op); lsSet("outbox",S.outbox); renderAll(); flush(); }

async function flush(){
  if(S.syncing || !S.pin) return;
  S.syncing=true;
  try{
    if(S.outbox.length){
      const ops=S.outbox.slice(0,40);
      const j=await api("sync",{ops});
      const done=new Set(j.done||[]);
      S.outbox=S.outbox.filter(o=>!done.has(o.opId)); lsSet("outbox",S.outbox);
    }
    const months=new Set([ymOf(todayStr()), S.listYm, S.repYm]);
    for(const ym of months){ const j=await api("list",{ym}); S.server[ym]=j.entries; }
    const c=await api("cats"); S.extra=c.cats; lsSet("extra",S.extra); rebuildHome();
    // 手機只留最近 6 個月的暫存
    const keep=Object.keys(S.server).sort().slice(-6); const slim={}; for(const k of keep) slim[k]=S.server[k];
    S.server=slim; lsSet("months",S.server);
    S.online=true;
  }catch(e){
    if(e.code==="pin"){ S.pin=""; lsSet("pin",""); showSetup("通關密碼不對或已經換了，請重新輸入。"); }
    else if(e.code==="locked") status("密碼打錯太多次，請 10 分鐘後再試。");
    else S.online=false;
  }finally{
    S.syncing=false; renderSync(); renderForm(); renderAll();
    if(S.outbox.length && S.online) setTimeout(flush, 500);
  }
}

// 從試算表的帳加上手機裡還沒傳上去的動作，算出現在畫面要顯示的帳
function monthEntries(ym){
  let list=(S.server[ym]||[]).slice();
  for(const op of S.outbox){
    if(op.type==="put"){
      list=list.filter(e=>e.id!==op.entry.id);
      if(ymOf(op.entry.date)===ym) list.push(op.entry);
    }else if(op.type==="del") list=list.filter(e=>e.id!==op.id);
  }
  return list;
}

function renderSync(){
  const n=S.outbox.filter(o=>o.type!=="cats").length;
  const el=$("sync");
  if(n) { el.textContent=(S.online?"傳送中… ":"沒有網路，")+n+" 筆還沒傳到試算表"; el.className="sync wait"; }
  else if(!S.online){ el.textContent="沒有網路，顯示的是上次的資料"; el.className="sync wait"; }
  else { el.textContent="已同步到 Google 試算表"; el.className="sync ok"; }
}

// ---------- 第一次設定 ----------
function showSetup(msg){
  $("setup").hidden=false; $("app").hidden=true; $("tabsNav").hidden=true;
  $("setupMsg").textContent=msg||""; $("setupMsg").hidden=!msg;
}
$("setupOk").onclick=async()=>{
  const pin=$("pinIn").value.trim();
  if(!/^\d{4,10}$/.test(pin)){ $("setupMsg").textContent="請輸入試算表「設定」頁的數字"; $("setupMsg").hidden=false; return; }
  $("setupOk").disabled=true; $("setupOk").textContent="確認中…";
  S.pin=pin;
  try{
    const j=await api("ping"); S.sheetUrl=j.sheetUrl; lsSet("sheetUrl",S.sheetUrl); lsSet("pin",pin);
    $("setup").hidden=true; $("app").hidden=false; $("tabsNav").hidden=false;
    toast("連上了！"); flush();
  }catch(e){
    S.pin="";
    $("setupMsg").textContent = e.code==="pin" ? "密碼不對，請再看一次試算表「設定」頁 B1 格" : e.code==="locked" ? "打錯太多次，請 10 分鐘後再試" : "連不上，請確認手機有網路";
    $("setupMsg").hidden=false;
  }
  $("setupOk").disabled=false; $("setupOk").textContent="開始記帳";
};

// ---------- 表單 ----------
function renderForm(){
  $("typeIn").classList.toggle("on",S.type==="in");
  $("typeOut").classList.toggle("on",S.type==="out");
  const cats=$("cats"); cats.innerHTML="";
  const list=catsOf(S.type);
  if(!list.some(c=>c.name===S.cat) && !S.edit) S.cat=list[0].name;
  for(const c of list){
    const custom=(S.extra[S.type]||[]).some(x=>x.name===c.name);
    const b=document.createElement("button"); b.type="button"; b.textContent=c.name;
    if(c.home){ const s=document.createElement("span"); s.className="tag-home"; s.textContent="家用"; b.append(s); }
    if(S.manage && custom){ b.classList.add("rm"); b.setAttribute("aria-label","刪除類別 "+c.name); }
    b.classList.toggle("on",!S.manage && c.name===S.cat);
    b.onclick=()=>{ if(S.manage){ if(custom) removeCat(c.name); return; } S.cat=c.name; renderForm(); };
    if(S.manage && !custom) b.disabled=true;
    cats.append(b);
  }
  const add=document.createElement("button"); add.type="button"; add.className="add"; add.textContent=S.manage?"完成":"＋ 新增類別";
  add.onclick=()=>{ if(S.manage){ S.manage=false; renderForm(); } else { $("newCat").hidden=false; $("newName").focus(); } };
  cats.append(add);
  if(!S.manage && (S.extra[S.type]||[]).length){
    const m=document.createElement("button"); m.type="button"; m.className="add"; m.textContent="刪除類別";
    m.onclick=()=>{ S.manage=true; $("newCat").hidden=true; renderForm(); };
    cats.append(m);
  }
  $("newHomeWrap").hidden = S.type!=="out";
  const it=$("items"); it.innerHTML="";
  const cur=list.find(c=>c.name===S.cat);
  for(const name of (cur?cur.items:[])){
    const b=document.createElement("button"); b.type="button"; b.textContent=name;
    b.onclick=()=>{ const n=$("note"); n.value = n.value.trim() ? n.value.trim()+"、"+name : name; };
    it.append(b);
  }
  it.hidden = !it.children.length;
  const pays=$("pays"); pays.innerHTML="";
  for(const p of PAYS){
    const b=document.createElement("button"); b.type="button"; b.textContent=p;
    b.classList.toggle("on",p===S.pay); b.onclick=()=>{ S.pay=p; renderForm(); };
    pays.append(b);
  }
  $("manageHint").hidden = !S.manage;
  $("formTitle").textContent = S.edit ? "修改這一筆" : "記一筆";
  $("addBtns").hidden = !!S.edit; $("editBtns").hidden = !S.edit;
  $("del").textContent = S.delArm ? "確定刪除？" : "刪除";
}

// ---------- 自訂類別 ----------
function saveExtra(next, okMsg){
  S.extra=next; lsSet("extra",next); rebuildHome();
  queue({type:"cats", cats:next}); toast(okMsg); renderForm();
}
$("newCancel").onclick=()=>{ $("newCat").hidden=true; $("newName").value=""; $("newHome").checked=false; };
$("newOk").onclick=()=>{
  const name=$("newName").value.trim().replace(/\s+/g," ");
  if(!name){ toast("請輸入類別名稱"); return; }
  if(catsOf("in").concat(catsOf("out")).some(c=>c.name===name)){ toast("已經有「"+name+"」了"); return; }
  const next={in:[...(S.extra.in||[])], out:[...(S.extra.out||[])]};
  const c={name, items:[]}; if(S.type==="out" && $("newHome").checked) c.home=true;
  next[S.type].push(c);
  S.cat=name; $("newCancel").onclick();
  saveExtra(next, "已新增「"+name+"」");
};
function removeCat(name){
  const next={in:(S.extra.in||[]).filter(c=>c.name!==name), out:(S.extra.out||[]).filter(c=>c.name!==name)};
  if(!next.in.length && !next.out.length) S.manage=false;
  saveExtra(next, "已刪除「"+name+"」");
}

function setType(t){ S.type=t; S.manage=false; S.cat=catsOf(t)[0].name; if(t==="in" && S.pay==="刷卡") S.pay="現金"; renderForm(); }
$("typeIn").onclick=()=>setType("in");
$("typeOut").onclick=()=>setType("out");
$("amt").addEventListener("input",e=>{ const v=e.target.value.replace(/[^\d]/g,""); if(v!==e.target.value) e.target.value=v; });

function renderWho(){ for(const b of document.querySelectorAll("#who button")) b.classList.toggle("on",b.dataset.who===S.who); }
for(const b of document.querySelectorAll("#who button")) b.onclick=()=>{ S.who=b.dataset.who; lsSet("who",S.who); renderWho(); status(""); };

function readForm(){
  const amount=parseInt($("amt").value,10);
  if(!amount||amount<=0){ toast("請輸入金額"); $("amt").focus(); return null; }
  const date=$("date").value||todayStr();
  return { date, type:S.type, cat:S.cat, amount, pay:S.pay, note:$("note").value.trim(), who:S.who||"" };
}
function resetForm(keepDate){
  $("amt").value=""; $("note").value="";
  if(!keepDate) $("date").value=todayStr();
  S.edit=null; S.delArm=false; renderForm();
}

$("save").onclick=()=>{
  const e=readForm(); if(!e) return;
  queue({type:"put", entry:{...e, id:uid(), createdAt:Date.now()}});
  toast((e.type==="in"?"收入 ":"支出 ")+money(e.amount)+" 已記下");
  resetForm(true);
};
function startEdit(e){
  S.edit=e; S.delArm=false; S.manage=false; S.type=e.type; S.cat=e.cat; S.pay=e.pay||"現金";
  $("amt").value=e.amount; $("note").value=e.note||""; $("date").value=e.date;
  showTab("add"); renderForm(); window.scrollTo(0,0);
}
$("cancelEdit").onclick=()=>resetForm();
$("update").onclick=()=>{
  const e=readForm(); if(!e||!S.edit) return;
  queue({type:"put", entry:{...e, id:S.edit.id, createdAt:S.edit.createdAt||Date.now()}});
  toast("已更新"); resetForm(); showTab("list");
};
$("del").onclick=()=>{
  if(!S.edit) return;
  if(!S.delArm){ S.delArm=true; renderForm(); setTimeout(()=>{ if(S.delArm){S.delArm=false;renderForm();} },4000); return; }
  queue({type:"del", id:S.edit.id}); toast("已刪除"); resetForm(); showTab("list");
};

// ---------- 統計與畫面 ----------
function sums(list){
  let inc=0,store=0,home=0; const byCat={};
  for(const e of list){
    if(e.type==="in") inc+=e.amount;
    else { if(HOME.has(e.cat)) home+=e.amount; else store+=e.amount; byCat[e.cat]=(byCat[e.cat]||0)+e.amount; }
  }
  return {inc,store,home,net:inc-store,byCat};
}
function renderToday(){
  const t=todayStr(); const s=sums(monthEntries(ymOf(t)).filter(e=>e.date===t));
  $("tIn").textContent=money(s.inc); $("tOut").textContent=money(s.store+s.home);
  $("tNet").textContent=money(s.net); $("tNet").className="num "+(s.net<0?"c-out":"");
}
function renderList(){
  const ym=S.listYm; $("mLabel").textContent=ymLabel(ym);
  for(const b of document.querySelectorAll("#listFilter button")) b.classList.toggle("on",b.dataset.f===S.filter);
  const f=S.filter;
  const list=monthEntries(ym).filter(e=> f==="all" || (f==="in"&&e.type==="in") || (f==="home"&&isHome(e)) || (f==="store"&&e.type==="out"&&!isHome(e)));
  const box=$("list"); box.innerHTML="";
  if(!S.server[ym] && !list.length){ box.innerHTML='<div class="empty"><b>讀取中…</b>正在拿這個月的帳</div>'; return; }
  if(!list.length){ box.innerHTML='<div class="empty"><b>這個月還沒有帳</b>到「記一筆」輸入金額、選類別，按「記下來」就好</div>'; return; }
  list.sort((a,b)=> b.date.localeCompare(a.date) || (b.createdAt||0)-(a.createdAt||0));
  const pend=new Set(S.outbox.filter(o=>o.type==="put").map(o=>o.entry.id));
  const days={}; for(const e of list) (days[e.date]=days[e.date]||[]).push(e);
  for(const [d,items] of Object.entries(days)){
    const s=sums(items); const dt=new Date(d+"T00:00");
    const card=document.createElement("div"); card.className="day";
    const h=document.createElement("div"); h.className="day-h";
    h.innerHTML=`<b>${dt.getMonth()+1}/${dt.getDate()}（${WD[dt.getDay()]}）</b><span>收 <span class="num c-in">${money(s.inc)}</span>　支 <span class="num c-out">${money(s.store+s.home)}</span></span>`;
    card.append(h);
    for(const e of items){
      const b=document.createElement("button"); b.type="button"; b.className="item";
      const cat=document.createElement("div"); cat.className="cat"; cat.textContent=e.cat;
      if(isHome(e)){ const t=document.createElement("span"); t.className="tag-home"; t.textContent="家用"; cat.append(t); }
      const meta=document.createElement("div"); meta.className="meta";
      meta.textContent=[e.note,e.pay,e.who,pend.has(e.id)?"還沒傳上去":""].filter(Boolean).join(" · ");
      const amt=document.createElement("div"); amt.className="amt num "+(e.type==="in"?"c-in":isHome(e)?"c-home":"c-out");
      amt.textContent=(e.type==="in"?"+":"−")+money(e.amount);
      b.append(cat,meta,amt); b.onclick=()=>startEdit(e);
      card.append(b);
    }
    box.append(card);
  }
}
function renderRep(){
  const ym=S.repYm; $("rLabel").textContent=ymLabel(ym);
  const list=monthEntries(ym); const s=sums(list);
  const openDays=new Set(list.filter(e=>e.type==="in").map(e=>e.date)).size;
  const rows=[
    ["營收",s.inc,"c-in",openDays?`營業 ${openDays} 天，平均一天 ${money(s.inc/openDays)}`:""],
    ["店的支出",-s.store,"c-out","食材、調味、包材、營業成本"],
    ["店賺（淨利）",s.net,s.net<0?"c-out":"",""],
    ["家用（生活開銷）",-s.home,"c-home",""],
  ];
  const pl=$("pl"); pl.innerHTML="";
  for(const [k,v,c,sub] of rows){
    const r=document.createElement("div"); r.className="r";
    r.innerHTML=`<div>${k}${sub?`<div class="sub">${sub}</div>`:""}</div><div class="num ${c}">${v<0?"−":""}${money(Math.abs(v))}</div>`;
    pl.append(r);
  }
  const left=s.net-s.home;
  const r=document.createElement("div"); r.className="r total";
  r.innerHTML=`<div>本月剩下<div class="sub">店賺 − 家用</div></div><div class="num ${left<0?"c-out":"c-in"}">${left<0?"−":""}${money(Math.abs(left))}</div>`;
  pl.append(r);
  const bars=$("bars"); bars.innerHTML="";
  const cats=catsOf("out").map(c=>[c.name,s.byCat[c.name]||0,!!c.home]);
  for(const n of Object.keys(s.byCat)) if(!cats.some(c=>c[0]===n)) cats.push([n,s.byCat[n],false]);
  const max=Math.max(1,...cats.map(c=>c[1])); const tot=s.store+s.home||1;
  for(const [n,v,h] of cats){
    const d=document.createElement("div");
    d.innerHTML=`<div class="bar-l"><span>${n}${h?'<span class="tag-home">家用</span>':""}</span><span><span class="num">${money(v)}</span> <span class="note">${Math.round(v/tot*100)}%</span></span></div><div class="bar"><i style="width:${v/max*100}%;background:var(${h?"--home":"--out"})"></i></div>`;
    bars.append(d);
  }
  const tb=$("daily"); tb.innerHTML="";
  const days={}; for(const e of list) (days[e.date]=days[e.date]||[]).push(e);
  const keys=Object.keys(days).sort();
  if(!keys.length){ tb.innerHTML='<tr><td colspan="4" style="text-align:center;font-family:var(--f-body);color:var(--muted)">這個月還沒有帳</td></tr>'; return; }
  for(const d of keys){
    const x=sums(days[d]); const dt=new Date(d+"T00:00");
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${dt.getMonth()+1}/${dt.getDate()}（${WD[dt.getDay()]}）</td><td class="c-in">${money(x.inc)}</td><td class="c-out">${money(x.store)}</td><td class="${x.net<0?"c-out":""}">${money(x.net)}</td>`;
    tb.append(tr);
  }
}
function renderAll(){ renderToday(); renderList(); renderRep(); renderSync(); }

// ---------- 分頁 ----------
function showTab(t){
  for(const b of document.querySelectorAll("nav.tabs button")) b.classList.toggle("on",b.dataset.tab===t);
  $("tab-add").hidden=t!=="add"; $("tab-list").hidden=t!=="list"; $("tab-rep").hidden=t!=="rep";
  lsSet("tab",t);
}
for(const b of document.querySelectorAll("nav.tabs button")) b.onclick=()=>showTab(b.dataset.tab);
for(const b of document.querySelectorAll("#listFilter button")) b.onclick=()=>{ S.filter=b.dataset.f; renderList(); };
function goMonth(which,k){ S[which]=shiftYm(S[which],k); renderAll(); flush(); }
$("mPrev").onclick=()=>goMonth("listYm",-1); $("mNext").onclick=()=>goMonth("listYm",1);
$("rPrev").onclick=()=>goMonth("repYm",-1);  $("rNext").onclick=()=>goMonth("repYm",1);

$("sheet").onclick=()=>{ if(S.sheetUrl) window.open(S.sheetUrl,"_blank"); else toast("還沒連上試算表"); };
$("csv").onclick=async()=>{
  const list=[...monthEntries(S.repYm)].sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
  if(!list.length){ toast("這個月沒有資料"); return; }
  const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
  const lines=[["日期","收支","類別","店/家用","金額","品項備註","付款方式","記帳人"].join(",")];
  for(const e of list) lines.push([e.date,e.type==="in"?"收入":"支出",e.cat,isHome(e)?"家用":e.type==="in"?"":"店",e.amount,e.note,e.pay,e.who].map(q).join(","));
  const name="巷口小食_"+S.repYm+".csv";
  const file=new File(["﻿"+lines.join("\r\n")],name,{type:"text/csv"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})) await navigator.share({files:[file], title:name});
    else { const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
  }catch(_){}
};
$("logout").onclick=()=>{
  if(!$("logout").dataset.arm){ $("logout").dataset.arm="1"; $("logout").textContent="再按一次確認"; setTimeout(()=>{ delete $("logout").dataset.arm; $("logout").textContent="換通關密碼"; },4000); return; }
  S.pin=""; lsSet("pin",""); showSetup();
};

// ---------- 啟動 ----------
$("date").value=todayStr();
const savedTab=lsGet("tab","add"); showTab(["add","list","rep"].includes(savedTab)?savedTab:"add");
renderWho(); renderForm(); renderAll();
if(!S.pin) showSetup();
else { if(!S.who) status("先在右上角點一下你是誰（禎／雅），之後每筆帳都會記上名字。"); flush(); }
setInterval(()=>{ if(document.visibilityState==="visible") flush(); }, 30000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") flush(); });
addEventListener("online",flush);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
