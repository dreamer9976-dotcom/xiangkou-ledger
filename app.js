// 巷口小食記帳（獨立 app 版）— 帳存在 Google 試算表，手機上離線也能先記，有網路再自動傳上去
// 第 7 版：記帳畫面改成跟天天記帳一樣（一頁完成：大類 → 品項 → 計算機），明細／報表改成表格，可搜尋
const API_URL = "https://script.google.com/macros/s/AKfycbx_lJFH3PPLeauWDsYj7fR4N60zBcOlwSEfLcyYxN-T1G-C0cQobNS5ZkScbcjx-fE-6A/exec";

// ---------- 類別（照天天記帳「巷口小食館」用過的整理，品項依使用次數排序） ----------
const CATS = {
  in: [
    {name:"現金收入", items:[]},
    {name:"LINE Pay", items:[]},
    {name:"台灣Pay", items:[]},
    {name:"全支付", items:[]},
    {name:"熊貓", items:["1-15 撥款","16-30 撥款"]},
    {name:"其他收入", items:["廢油","隔壁水電"]},
  ],
  out: [
    {name:"肉品", items:["頭骨","排骨肉","貢丸","肉燥","餛飩肉","豬肉","雞腿","絞肉","肉絲","板油"]},
    {name:"生鮮食材", items:["地瓜葉","青菜","蒜碎/薑絲","麵條","粄條","蛋","餛飩皮","水餃","海帶素肉","冬粉","筍乾"]},
    {name:"調味品/包材", items:["米","醬油","622餐盒","沙拉油","耐炸油","B膏","750碗","油蔥酥","油膏","地瓜粉","雞粉","洗碗精","3斤花袋","芝麻醬","850碗","花生醬","筷子","粿盒","520","雜項調味品","雜項用品"]},
    {name:"營業成本", items:["瓦斯","油資","熊貓抽成","熊貓月租費","店租","停車費","水費","電費","汽機車保養","電話網路","短少","雜項"]},
  ]
};
// 家用：同一本帳，類別另外分
const HOME_CATS = {
  in: [
    {name:"家用收入", home:true, items:["存股","零股","退款"]},
  ],
  out: [
    {name:"餐費", home:true, items:["早餐","午餐","晚餐","飲食","麵包","水果","爸餐食"]},
    {name:"飲料", home:true, items:["飲料","咖啡","礦泉水","養樂多"]},
    {name:"家用食材", home:true, items:["家樂福","全聯","Momo"]},
    {name:"生活雜項", home:true, items:["日用品","寶雅","蝦皮","大盤大"]},
    {name:"醫療", home:true, items:["醫療","藥品","按摩"]},
    {name:"保險", home:true, items:[]},
    {name:"稅費", home:true, items:["房屋稅","地價稅","牌照稅","燃料稅","國民年金"]},
    {name:"貸款", home:true, items:[]},
    {name:"信用卡", home:true, items:["台新","中信","第一銀"]},
    {name:"貓咪", home:true, items:[]},
    {name:"娛樂", home:true, items:[]},
    {name:"其他家用", home:true, items:["有線電視"]},
  ]
};
const LEGACY_HOME = ["生活開銷"];  // 舊帳的家用類別
// 帳戶：存在試算表「帳戶」分頁；這裡是還沒連上時的預設
const DEFAULT_ACCTS = [
  {name:"現金",opening:0,debt:false,counted:true},{name:"銀行",opening:0,debt:false,counted:true},
  {name:"熊貓1-15",opening:0,debt:false,counted:false},{name:"熊貓16-30",opening:0,debt:false,counted:false},
  {name:"家用",opening:0,debt:false,counted:false},{name:"禎帳戶",opening:0,debt:true,counted:false},
];

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayStr = () => ymd(new Date());
const ymOf = s => s.slice(0,7);
const money = n => Math.round(n).toLocaleString("zh-TW");
const money2 = n => (Math.round(n*100)/100).toLocaleString("zh-TW",{maximumFractionDigits:2});
const shiftYm = (ym,k) => { let [y,m]=ym.split("-").map(Number); m+=k; while(m<1){m+=12;y--} while(m>12){m-=12;y++} return y+"-"+pad(m); };
const ymLabel = ym => { const [y,m]=ym.split("-").map(Number); return (y-1911)+" 年 "+m+" 月"; };
const WD = "日一二三四五六";
const dayLabel = d => { const dt=new Date(d+"T00:00"); return `${dt.getMonth()+1}/${dt.getDate()}（${WD[dt.getDay()]}）`; };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function lsGet(k,def){ try{ const v=localStorage.getItem(k); return v==null?def:JSON.parse(v); }catch(_){ return def; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} }

// ---------- 狀態 ----------
const S = {
  book: lsGet("book","store"), type:"out", cat:"", item:"", pay:"現金", who: lsGet("who",""),
  expr:"", justEval:false, edit:null, delArm:false,
  listYm: ymOf(todayStr()), repYm: ymOf(todayStr()), filter:"all", q:"",
  listMode: lsGet("listMode","cal"), selDay: todayStr(), searchOn:false,
  pin: lsGet("pin",""), sheetUrl: lsGet("sheetUrl",""),
  server: lsGet("months",{}),     // 從試算表拿到的帳（也存在手機，沒網路時照樣看得到）
  outbox: lsGet("outbox",[]),     // 還沒傳上去的動作
  extra: lsGet("extra",{in:[],out:[]}),
  accounts: lsGet("accounts",DEFAULT_ACCTS), flows: lsGet("flows",{}),
  acctEdit:null, acctDelArm:false, online:true, syncing:false, tab:"add",
};

const catsOf = (t, book) => {
  const b = book || S.book;
  return (b==="home"?HOME_CATS:CATS)[t].concat(((S.extra[t])||[]).filter(c=>!!c.home===(b==="home")));
};
const allCats = () => [...catsOf("in","store"),...catsOf("out","store"),...catsOf("in","home"),...catsOf("out","home")];
let HOME = new Set();
function rebuildHome(){ HOME = new Set([...catsOf("in","home"),...catsOf("out","home")].map(c=>c.name).concat(LEGACY_HOME)); }
rebuildHome();
const isHome = e => e.type!=="tr" && (e.book ? e.book==="home" : HOME.has(e.cat));
// 品項寫在「品項備註」欄的第一個詞，後面是備註
const itemOf = e => (e.note||"").trim().split(/\s+/)[0] || "";
const memoOf = e => (e.note||"").trim().split(/\s+/).slice(1).join(" ");

function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,1800); }

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
      const j=await api("sync",{ops:S.outbox.slice(0,40)});
      const done=new Set(j.done||[]);
      S.outbox=S.outbox.filter(o=>!done.has(o.opId)); lsSet("outbox",S.outbox);
    }
    const months=new Set([ymOf(todayStr()), S.listYm, S.repYm]);
    for(const ym of months){ const j=await api("list",{ym}); S.server[ym]=j.entries; }
    const c=await api("cats"); S.extra=c.cats; lsSet("extra",S.extra); rebuildHome();
    try{
      const a=await api("accounts");
      if(a.accounts && a.accounts.length){ S.accounts=a.accounts; lsSet("accounts",S.accounts); }
      S.flows=a.flows||{}; lsSet("flows",S.flows);
    }catch(e){ if(e.code!=="action") throw e; }
    const keep=Object.keys(S.server).sort().slice(-12); const slim={}; for(const k of keep) slim[k]=S.server[k];
    S.server=slim; lsSet("months",S.server);
    S.online=true;
  }catch(e){
    if(e.code==="pin"){ S.pin=""; lsSet("pin",""); showSetup("通關密碼不對或已經換了，請重新輸入。"); }
    else if(e.code==="locked") toast("密碼打錯太多次，請 10 分鐘後再試");
    else S.online=false;
  }finally{
    S.syncing=false; renderAll(); renderAdd();
    if(S.outbox.length && S.online) setTimeout(flush, 500);
  }
}
// 搜尋時把還沒拿過的月份補拿（最近 12 個月）
let fetchingMonths=false;
async function ensureMonths(n){
  if(fetchingMonths || !S.pin) return; fetchingMonths=true;
  try{
    let ym=ymOf(todayStr());
    for(let i=0;i<n;i++){ if(!S.server[ym]){ const j=await api("list",{ym}); S.server[ym]=j.entries; renderList(); } ym=shiftYm(ym,-1); }
    lsSet("months",S.server);
  }catch(_){ } finally{ fetchingMonths=false; }
}

// 試算表的帳＋手機裡還沒傳上去的動作
function monthEntries(ym){
  let list=(S.server[ym]||[]).slice();
  for(const op of S.outbox){
    if(op.type==="put"){ list=list.filter(e=>e.id!==op.entry.id); if(ymOf(op.entry.date)===ym) list.push(op.entry); }
    else if(op.type==="del") list=list.filter(e=>e.id!==op.id);
  }
  return list;
}
function allLoadedEntries(){
  const yms=new Set(Object.keys(S.server)); for(const op of S.outbox) if(op.type==="put") yms.add(ymOf(op.entry.date));
  return [...yms].flatMap(ym=>monthEntries(ym));
}

// ---------- 統計 ----------
// inc＝店的營收、store＝店的支出、home＝家用支出、homeInc＝家用收入
function sums(list){
  let inc=0,store=0,home=0,homeInc=0; const byCat={store:{},home:{}};
  for(const e of list){
    if(e.type==="tr") continue;
    const h=isHome(e);
    if(e.type==="in"){ if(h) homeInc+=e.amount; else inc+=e.amount; }
    else { if(h) home+=e.amount; else store+=e.amount; const b=byCat[h?"home":"store"]; b[e.cat]=(b[e.cat]||0)+e.amount; }
  }
  return {inc,store,home,homeInc,net:inc-store,byCat};
}

// ---------- 帳戶餘額 ----------
const acctNames = () => S.accounts.map(a=>a.name);
function effectOf(e){
  const f={}; const add=(k,v)=>{ if(k) f[k]=(f[k]||0)+v; };
  if(e.type==="in") add(e.pay,e.amount);
  else if(e.type==="out") add(e.pay,-e.amount);
  else if(e.type==="tr"){ add(e.pay,-e.amount); add(e.cat,e.amount); }
  return f;
}
function currentFlows(){
  const f={...S.flows};
  const known=new Set(); for(const ym in S.server) for(const e of S.server[ym]) known.add(e.id);
  for(const op of S.outbox) if(op.type==="put" && !known.has(op.entry.id)){ const x=effectOf(op.entry); for(const k in x) f[k]=(f[k]||0)+x[k]; }
  return f;
}
const balanceOf = (a,f) => (a.opening||0)+((f||currentFlows())[a.name]||0);

// ---------- 計算機 ----------
function evalExpr(s){
  const toks=s.match(/\d+|[+\-*/]/g)||[];
  while(toks.length && /[+\-*/]/.test(toks[toks.length-1])) toks.pop();
  if(!toks.length) return 0;
  const vals=[Number(toks[0])], ops=[];
  for(let i=1;i<toks.length;i+=2){
    const op=toks[i], v=Number(toks[i+1]);
    if(op==="*") vals[vals.length-1]*=v;
    else if(op==="/") vals[vals.length-1]= v ? vals[vals.length-1]/v : 0;
    else { ops.push(op); vals.push(v); }
  }
  let r=vals[0]; ops.forEach((op,i)=>{ r = op==="+" ? r+vals[i+1] : r-vals[i+1]; });
  return Math.round(r);
}
const prettyExpr = s => s.replace(/\*/g,"×").replace(/\//g,"÷").replace(/-/g,"−").replace(/\+/g,"＋");
function pressKey(k){
  if(k==="ok") return save();
  if(k==="C"){ S.expr=""; }
  else if(k==="back"){ S.expr=S.expr.slice(0,-1); }
  else if(/^\d+$/.test(k)){
    if(S.justEval) S.expr="";
    const last=(S.expr.match(/\d+$/)||[""])[0];
    if(last.length>=9) return;
    if(last==="0") S.expr=S.expr.slice(0,-1);
    if(!((k==="00"||k==="000") && last==="")) S.expr+=k;
  } else { // + - * /
    if(!S.expr) return;
    if(/[+\-*/]$/.test(S.expr)) S.expr=S.expr.slice(0,-1);
    S.expr+=k;
  }
  S.justEval=false; renderDisp();
}
for(const b of document.querySelectorAll("#keypad button")) b.onclick=()=>pressKey(b.dataset.k);

// ---------- 記一筆畫面（照天天記帳：一列一列填） ----------
const MEMBERS = ["禎","雅"];
function defaultPay(){
  const has=n=>acctNames().includes(n);
  const day=Number(($("date").value||todayStr()).slice(8));
  if(S.type==="in" && S.cat==="熊貓"){ const n=day<=15?"熊貓1-15":"熊貓16-30"; if(has(n)) S.pay=n; }
  else if(S.type==="in" && ["LINE Pay","台灣Pay","全支付"].includes(S.cat) && has("銀行")) S.pay="銀行";
  else if(S.type==="in" && S.cat==="現金收入" && has("現金")) S.pay="現金";
  else if(S.book==="home" && S.type!=="tr" && has("家用")) S.pay="家用";
  else if(S.type==="out" && ["家用","熊貓1-15","熊貓16-30"].includes(S.pay) && has("現金")) S.pay="現金";
}
function renderDisp(){
  const v=evalExpr(S.expr);
  const el=$("dVal");
  if(!S.expr){ el.textContent="輸入金額"; el.className="val blank"; }
  else { el.textContent=money(v); el.className="val "+(S.type==="out"?"out":S.type==="in"?"in":""); }
  $("dExpr").textContent=/[+\-*/]/.test(S.expr)?prettyExpr(S.expr)+" ＝":"";
}
function renderAdd(){
  const names=acctNames();
  if(!names.includes(S.pay)) S.pay=names[0]||"現金";
  const tr=S.type==="tr";
  $("bookStore").classList.toggle("on",S.book==="store");
  $("bookHome").classList.toggle("on",S.book==="home");
  $("bookRow").hidden=tr;
  $("typeOut").classList.toggle("on",S.type==="out");
  $("typeIn").classList.toggle("on",S.type==="in");
  $("typeTr").classList.toggle("on",tr);
  const d=$("date").value||todayStr(); const dt=new Date(d+"T00:00");
  $("dateTxt").textContent=`${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日 週${WD[dt.getDay()]}${d===todayStr()?"（今天）":""}`;
  $("catRow").hidden=tr; $("acct2Row").hidden=!tr;
  if(tr){
    if(!names.includes(S.cat) || S.cat===S.pay) S.cat=names.find(n=>n!==S.pay)||"";
    $("acctLbl").textContent="轉出帳戶"; $("acct2Txt").textContent=S.cat||"選帳戶";
  } else {
    if(S.cat && !catsOf(S.type).some(c=>c.name===S.cat) && !S.edit){ S.cat=""; S.item=""; }
    $("acctLbl").textContent="帳戶";
    $("dItem").textContent = S.item || S.cat || "選類別";
    $("dCat").textContent = S.item ? S.cat : "";
  }
  $("acctTxt").textContent=S.pay;
  $("del").hidden=!S.edit; $("del").textContent=S.delArm?"再按一次確定刪除":"刪除這一筆";
  $("save").textContent=S.edit?"更新":"完成";
  $("saveTop").textContent=S.edit?"更新":"儲存";
  renderDisp();
}
function setBook(b){ if(S.book===b) return; S.book=b; lsSet("book",b); S.cat=""; S.item=""; defaultPay(); renderAdd(); }
function setType(t){ S.type=t; S.cat=""; S.item=""; if(t!=="tr") defaultPay(); renderAdd(); }
$("bookStore").onclick=()=>setBook("store");
$("bookHome").onclick=()=>setBook("home");
$("typeOut").onclick=()=>setType("out");
$("typeIn").onclick=()=>setType("in");
$("typeTr").onclick=()=>setType("tr");
$("date").addEventListener("change",()=>{ defaultPay(); renderAdd(); });
$("saveTop").onclick=()=>save();

// 選類別：先大類，點了再選品項，選完自動回到記帳畫面
// 長按可以拖曳調整順序（大類、品項都可以），順序記在這支手機
let pickCatObj=null;
const ORDER = lsGet("order",{});
function ordered(names, key){
  const o=ORDER[key]; if(!o) return names;
  const idx=n=>{ const i=o.indexOf(n); return i<0?1e6+names.indexOf(n):i; };
  return [...names].sort((x,y)=>idx(x)-idx(y));
}
function saveOrder(key, names){ ORDER[key]=names; lsSet("order",ORDER); }
function openCatPicker(){ pickCatObj=null; renderCatPicker(); $("itemSheet").hidden=false; }
function renderCatPicker(){
  const g=$("itemGrid"); g.innerHTML="";
  const bookLbl=S.book==="home"?"家用":"店用", typeLbl=S.type==="in"?"收入":"支出";
  if(!pickCatObj){
    $("itemTitle").textContent=bookLbl+typeLbl+"：選大類";
    $("itemBack").hidden=true; $("itemCustomRow").hidden=true;
    const key="cats:"+S.book+":"+S.type;
    const cats=catsOf(S.type); const byName={}; for(const c of cats) byName[c.name]=c;
    for(const n of ordered(cats.map(c=>c.name), key)){
      const c=byName[n];
      const b=dragBtn(n, key, ()=>{ S.cat=c.name; S.item=""; defaultPay(); if(c.items && c.items.length){ pickCatObj=c; renderCatPicker(); } else closeSheets(); });
      if(c.name===S.cat) b.classList.add("on");
      g.append(b);
    }
    const add=document.createElement("button"); add.type="button"; add.className="add"; add.textContent="＋ 新增"; add.onclick=()=>{ $("itemSheet").hidden=true; openCatSheet(); }; g.append(add);
  } else {
    const c=pickCatObj; const key="items:"+c.name;
    $("itemTitle").textContent=c.name+"：選品項";
    $("itemBack").hidden=false; $("itemCustomRow").hidden=false; $("itemCustom").value="";
    for(const it of ordered(c.items, key)){ const b=dragBtn(it, key, ()=>{ S.item=it; closeSheets(); }); if(it===S.item) b.classList.add("on"); g.append(b); }
    const p=document.createElement("button"); p.type="button"; p.className="plain"; p.textContent="只記「"+c.name+"」"; p.onclick=()=>{ S.item=""; closeSheets(); }; g.append(p);
  }
}
// 可拖曳的按鈕：點一下＝選；按住不放約半秒＝拿起來，拖到別的位置放開
let drag=null;
function dragBtn(name, key, onPick){
  const b=document.createElement("button"); b.type="button"; b.textContent=name; b.dataset.name=name; b.dataset.key=key;
  let timer=null, sx=0, sy=0, moved=false, pid=null;
  b.addEventListener("pointerdown",e=>{
    sx=e.clientX; sy=e.clientY; moved=false; pid=e.pointerId;
    timer=setTimeout(()=>{ drag={b,key}; try{ b.setPointerCapture(pid); }catch(_){} b.classList.add("dragging"); $("itemGrid").classList.add("sorting"); try{ navigator.vibrate&&navigator.vibrate(15); }catch(_){} },450);
  });
  b.addEventListener("pointermove",e=>{
    if(!drag){ if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>10){ clearTimeout(timer); moved=true; } return; }
    const el=document.elementFromPoint(e.clientX,e.clientY); const t=el&&el.closest("#itemGrid button[data-name]");
    if(t && t!==b && t.dataset.key===key){
      const g=$("itemGrid"); const kids=[...g.children];
      if(kids.indexOf(t)>kids.indexOf(b)) t.after(b); else t.before(b);
    }
  });
  const end=()=>{
    clearTimeout(timer);
    if(drag && drag.b===b){
      b.classList.remove("dragging"); $("itemGrid").classList.remove("sorting");
      saveOrder(key,[...$("itemGrid").querySelectorAll("button[data-name]")].map(x=>x.dataset.name));
      drag=null; b.dataset.justDragged="1"; setTimeout(()=>delete b.dataset.justDragged,50);
      toast("已調整順序");
    }
  };
  b.addEventListener("pointerup",end); b.addEventListener("pointercancel",end);
  b.addEventListener("click",()=>{ if(b.dataset.justDragged||moved) return; onPick(); });
  b.addEventListener("contextmenu",e=>e.preventDefault());
  return b;
}
// 拖曳時不要讓畫面跟著捲動
$("itemGrid").addEventListener("touchmove",e=>{ if(drag) e.preventDefault(); },{passive:false});
$("catRow").onclick=openCatPicker;
$("itemBack").onclick=()=>{ pickCatObj=null; renderCatPicker(); };
$("itemCustomOk").onclick=()=>{ const v=$("itemCustom").value.trim().replace(/\s+/g,""); if(!v){ toast("請輸入品項"); return; } S.item=v; closeSheets(); };
$("itemCustom").addEventListener("keydown",e=>{ if(e.key==="Enter") $("itemCustomOk").onclick(); });
function closeSheets(){ for(const id of ["itemSheet","acctSheet","catSheet"]) $(id).hidden=true; renderAdd(); }
$("itemClose").onclick=closeSheets; $("acctSheetClose").onclick=closeSheets; $("catSheetClose").onclick=closeSheets;
for(const id of ["itemSheet","acctSheet","catSheet"]) $(id).addEventListener("click",e=>{ if(e.target.id===id) closeSheets(); });

// 共用的選單（帳戶、成員）
function openList(title, options, current, onPick){
  const l=$("acctSheetList"); l.innerHTML=""; $("acctSheetTitle").textContent=title;
  for(const n of options){ const b=document.createElement("button"); b.type="button"; b.className=n===current?"on":""; b.innerHTML=`<span>${esc(n)}</span><span>${n===current?"✓":""}</span>`; b.onclick=()=>{ onPick(n); closeSheets(); }; l.append(b); }
  $("acctSheet").hidden=false;
}
$("acctRow").onclick=()=>openList(S.type==="tr"?"從哪個帳戶轉出":S.type==="in"?"收到哪個帳戶":"從哪個帳戶付", acctNames(), S.pay, n=>{ S.pay=n; });
$("acct2Row").onclick=()=>openList("轉進哪個帳戶", acctNames().filter(n=>n!==S.pay), S.cat, n=>{ S.cat=n; });

// 新增／刪除自己的類別
let rmArm=null;
function openCatSheet(){
  const bookLbl=S.book==="home"?"家用":"店用", typeLbl=S.type==="in"?"收入":"支出";
  $("catSheetTitle").textContent="新增"+bookLbl+typeLbl+"類別";
  $("newName").value=""; rmArm=null; renderCustomGrid(); $("catSheet").hidden=false;
}
function renderCustomGrid(){
  const g=$("customGrid"); g.innerHTML="";
  const mine=(S.extra[S.type]||[]).filter(c=>!!c.home===(S.book==="home"));
  $("catSheetNote").hidden=!mine.length;
  for(const c of mine){ const b=document.createElement("button"); b.type="button"; b.className="rm"; b.textContent=rmArm===c.name?"確定刪除？":c.name+" ×";
    b.onclick=()=>{ if(rmArm!==c.name){ rmArm=c.name; renderCustomGrid(); return; } removeCat(c.name); }; g.append(b); }
}
function saveExtra(next,msg){ S.extra=next; lsSet("extra",next); rebuildHome(); queue({type:"cats",cats:next}); toast(msg); }
$("newOk").onclick=()=>{
  const name=$("newName").value.trim().replace(/\s+/g," ");
  if(!name){ toast("請輸入類別名稱"); return; }
  if(allCats().some(c=>c.name===name)){ toast("已經有「"+name+"」了"); return; }
  const next={in:[...(S.extra.in||[])], out:[...(S.extra.out||[])]};
  const c={name, items:[]}; if(S.book==="home") c.home=true;
  next[S.type].push(c); saveExtra(next,"已新增「"+name+"」");
  S.cat=name; S.item=""; closeSheets();
};
function removeCat(name){
  const next={in:(S.extra.in||[]).filter(c=>c.name!==name), out:(S.extra.out||[]).filter(c=>c.name!==name)};
  saveExtra(next,"已刪除「"+name+"」"); if(S.cat===name){ S.cat=""; S.item=""; } rmArm=null; renderCustomGrid(); renderAdd();
}

// 儲存／更新／刪除
function readForm(){
  const amount=evalExpr(S.expr);
  if(!amount||amount<=0){ toast("請用下面的鍵盤輸入金額"); return null; }
  if(S.type==="tr"){ if(!S.cat||S.cat===S.pay){ toast("請選轉入帳戶"); return null; } }
  else if(!S.cat){ toast("請先選類別"); openCatPicker(); return null; }
  const note=[S.item, $("memo").value.trim().replace(/\s+/g," ")].filter(Boolean).join(" ");
  return { date:$("date").value||todayStr(), type:S.type, book:S.type==="tr"?"":S.book, cat:S.cat, amount, pay:S.pay, note, who:S.who||"" };
}
function resetForm(){
  S.expr=""; S.justEval=false; $("memo").value=""; S.edit=null; S.delArm=false;
  $("date").value=todayStr(); S.cat=""; S.item=""; defaultPay();
  renderAdd();
}
function save(){
  const e=readForm(); if(!e) return;
  if(S.edit){
    queue({type:"put", entry:{...e, id:S.edit.id, createdAt:S.edit.createdAt||Date.now()}});
    toast("已更新"); resetForm(); showTab("list"); return;
  }
  queue({type:"put", entry:{...e, id:uid(), createdAt:Date.now()}});
  toast((e.type==="tr"?"轉帳":(e.note.split(" ")[0]||e.cat))+" "+money(e.amount)+" 已記下");
  S.expr=""; S.justEval=false; S.item=""; S.cat=""; $("memo").value=""; renderAdd();
}
function startEdit(e){
  S.edit=e; S.delArm=false; S.type=e.type; S.cat=e.cat; S.pay=e.pay||"現金";
  if(e.type!=="tr"){ S.book=isHome(e)?"home":"store"; S.item=itemOf(e); $("memo").value=memoOf(e); }
  else { S.item=""; $("memo").value=e.note||""; }
  if(!acctNames().includes(S.pay)) S.accounts=[...S.accounts,{name:S.pay,opening:0,debt:false,counted:false}];
  S.expr=String(e.amount); S.justEval=true; $("date").value=e.date;
  showTab("add"); renderAdd();
}
$("cancelEdit").onclick=()=>{ const wasEdit=!!S.edit; resetForm(); if(wasEdit) showTab("list"); };
$("del").onclick=()=>{
  if(!S.edit) return;
  if(!S.delArm){ S.delArm=true; renderAdd(); setTimeout(()=>{ if(S.delArm){ S.delArm=false; renderAdd(); } },4000); return; }
  queue({type:"del", id:S.edit.id}); toast("已刪除"); resetForm(); showTab("list");
};

// ---------- 明細（表格＋搜尋） ----------
// 類別小圓圖示（顏色依類別固定）
function icColor(name){ let h=0; for(const ch of String(name)) h=(h*31+ch.charCodeAt(0))%360; return `hsl(${h} 45% 48%)`; }
function rowHtml(e, pend){
  const h=isHome(e);
  const main = e.type==="tr" ? "轉帳" : (itemOf(e) || e.cat);
  const subParts = e.type==="tr" ? [e.pay+" → "+e.cat, e.note] : [memoOf(e), itemOf(e)&&itemOf(e)!==e.cat?e.cat:"", pend?"還沒傳上去":""];
  const cls = e.type==="in" ? "c-in" : e.type==="out" ? "c-out" : "";
  const sign = e.type==="in" ? "+" : e.type==="out" ? "−" : "";
  const icTxt = e.type==="tr" ? "轉" : String(e.cat||"?").slice(0,1);
  const icBg = e.type==="tr" ? "var(--muted)" : icColor(e.cat);
  return `<tr class="row" data-id="${esc(e.id)}"><td><div class="item"><span class="ic" style="background:${icBg}">${esc(icTxt)}</span><span>${esc(main)}${h?'<span class="tag">家用</span>':""}</span></div><div class="sub ind">${esc(subParts.filter(Boolean).join(" · "))}</div></td>`+
    `<td class="r"><div class="num ${cls}" style="font-size:1.4rem">${sign}${money(e.amount)}</div><div class="sub">${esc(e.type==="tr"?"":e.pay)}</div></td></tr>`;
}
function renderEntries(list, box, opts){
  if(!list.length){ box.innerHTML = opts.empty; return; }
  list.sort((a,b)=> b.date.localeCompare(a.date) || (b.createdAt||0)-(a.createdAt||0));
  const pend=new Set(S.outbox.filter(o=>o.type==="put").map(o=>o.entry.id));
  const days={}; for(const e of list) (days[e.date]=days[e.date]||[]).push(e);
  let html='<table class="t">';
  if(opts.noDay){ for(const e of list) html+=rowHtml(e, pend.has(e.id)); }
  else for(const [d,items] of Object.entries(days)){
    const s=sums(items); const parts=[];
    if(s.inc) parts.push(`收 <span class="c-in">${money(s.inc)}</span>`);
    if(s.store+s.home) parts.push(`支 <span class="c-out">${money(s.store+s.home)}</span>`);
    html+=`<tr class="day"><td><b>${dayLabel(d)}</b></td><td class="r">${parts.join("　")}</td></tr>`;
    for(const e of items) html+=rowHtml(e, pend.has(e.id));
  }
  box.innerHTML=html+"</table>";
  const byId={}; for(const e of list) byId[e.id]=e;
  for(const tr of box.querySelectorAll("tr.row")) tr.onclick=()=>startEdit(byId[tr.dataset.id]);
}
function renderList(){
  const q=S.searchOn ? S.q.trim() : "";
  $("listHead").hidden=!!q;
  for(const b of document.querySelectorAll("#modeSeg button")) b.classList.toggle("on",b.dataset.mode===S.listMode);
  $("searchRow").hidden=!S.searchOn;
  const box=$("list");
  if(q){
    const words=q.toLowerCase().split(/\s+/);
    const hits=allLoadedEntries().filter(e=>{ const hay=[e.note,e.cat,e.pay,e.who].join(" ").toLowerCase(); return words.every(w=>hay.includes(w)); });
    const s=sums(hits);
    const months=Object.keys(S.server).sort(); const range=months.length?ymLabel(months[0])+"～"+ymLabel(months[months.length-1]):"";
    const head=`<p class="note">找到 ${hits.length} 筆（${range}）　支出 <span class="c-out">${money(s.store+s.home)}</span>　收入 <span class="c-in">${money(s.inc+s.homeInc)}</span>${fetchingMonths?"　…還在找更早的月份":""}</p>`;
    const tmp=document.createElement("div");
    renderEntries(hits, tmp, {empty:'<div class="empty"><b>找不到「'+esc(q)+'」</b>試試別的字，例如品項名稱或備註</div>'});
    box.innerHTML=head+tmp.innerHTML;
    const byId={}; for(const e of hits) byId[e.id]=e;
    for(const tr of box.querySelectorAll("tr.row")) tr.onclick=()=>startEdit(byId[tr.dataset.id]);
    return;
  }
  const ym=S.listYm; const [yy,mm]=ym.split("-").map(Number);
  $("mLabel").textContent = yy+"年"+mm+"月";
  $("calWrap").hidden = S.listMode!=="cal"; $("listWrap").hidden = S.listMode==="cal";
  if(S.listMode==="cal"){ renderCal(); return; }
  for(const b of document.querySelectorAll("#listFilter button")) b.classList.toggle("on",b.dataset.f===S.filter);
  const all=monthEntries(ym); const m=sums(all);
  const t=todayStr(); const showToday = ymOf(t)===ym; const d=sums(all.filter(e=>e.date===t));
  $("listSum").innerHTML =
    `<div><span class="l">${showToday?"今日營收":"營收"}</span><span class="num c-in">${money(showToday?d.inc:m.inc)}</span></div>`+
    `<div><span class="l">${showToday?"今日店支出":"店支出"}</span><span class="num c-out">${money(showToday?d.store:m.store)}</span></div>`+
    `<div><span class="l">本月店賺</span><span class="num ${m.net<0?"c-out":""}">${money(m.net)}</span></div>`+
    `<div><span class="l">本月家用</span><span class="num c-out">${money(m.home)}</span></div>`;
  const f=S.filter;
  const list=all.filter(e=> f==="all" || (f==="home"&&isHome(e)) || (f==="store"&&e.type!=="tr"&&!isHome(e)) || (f==="tr"&&e.type==="tr"));
  if(!S.server[ym] && !list.length){ box.innerHTML='<div class="empty"><b>讀取中…</b>正在拿這個月的帳</div>'; return; }
  renderEntries(list, box, {empty:'<div class="empty"><b>這個月還沒有帳</b>到「記一筆」點類別、輸入金額，按「記下來」</div>'});
}
// 行事曆：週一開始，點日期看當天的帳（跟天天記帳一樣）
function renderCal(){
  const ym=S.listYm; const [y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1); const offset=(first.getDay()+6)%7;
  const daysIn=new Date(y,m,0).getDate(); const cells=Math.ceil((offset+daysIn)/7)*7;
  const t=todayStr();
  const byDay={}; for(const k of [shiftYm(ym,-1),ym,shiftYm(ym,1)]) for(const e of monthEntries(k)) (byDay[e.date]=byDay[e.date]||[]).push(e);
  let h=["一","二","三","四","五","六","日"].map(w=>`<div class="wd">週${w}</div>`).join("");
  for(let i=0;i<cells;i++){
    const d=ymd(new Date(y,m-1,1-offset+i)); const es=byDay[d]||[];
    const hasIn=es.some(e=>e.type==="in"), hasOut=es.some(e=>e.type==="out");
    const cls=[ymOf(d)!==ym?"other":"", es.length?"has":"", d===t?"today":"", d===S.selDay?"sel":""].filter(Boolean).join(" ");
    h+=`<button type="button" class="${cls}" data-d="${d}"><span class="d">${d===t?"今天":Number(d.slice(8))}</span><span class="dots">${hasIn?'<i class="di"></i>':""}${hasOut?'<i class="do"></i>':""}</span></button>`;
  }
  $("cal").innerHTML=h;
  for(const b of $("cal").querySelectorAll("button")) b.onclick=()=>{ const d=b.dataset.d; S.selDay=d; if(ymOf(d)!==S.listYm){ S.listYm=ymOf(d); flush(); } renderList(); };
  const es=(byDay[S.selDay]||[]); const s=sums(es);
  const inc=s.inc+s.homeInc, out=s.store+s.home, net=inc-out;
  $("daySum").innerHTML=`<span>收入:<span class="num c-in">${money(inc)}</span></span><span>支出:<span class="num c-out">${money(out)}</span></span><span>合計:<span class="num ${net<0?"c-out":""}">${money(net)}</span></span>`;
  renderEntries(es, $("list"), {noDay:true, empty:'<div class="empty"><b>這天沒有帳</b>點下面的「＋記一筆」新增</div>'});
}
for(const b of document.querySelectorAll("#modeSeg button")) b.onclick=()=>{ S.listMode=b.dataset.mode; lsSet("listMode",S.listMode); renderList(); };
$("searchBtn").onclick=()=>{ S.searchOn=true; renderList(); $("q").focus(); };
$("searchClose").onclick=()=>{ S.searchOn=false; S.q=""; $("q").value=""; renderList(); };
let qTimer=null;
$("q").addEventListener("input",e=>{ S.q=e.target.value; clearTimeout(qTimer); qTimer=setTimeout(()=>{ renderList(); if(S.q.trim()) ensureMonths(12).then(renderList); },200); });
for(const b of document.querySelectorAll("#listFilter button")) b.onclick=()=>{ S.filter=b.dataset.f; renderList(); };

// ---------- 圖表分析（表格） ----------
function renderRep(){
  const ym=S.repYm; $("rLabel").textContent=ymLabel(ym);
  const list=monthEntries(ym); const s=sums(list);
  const openDays=new Set(list.filter(e=>e.type==="in"&&!isHome(e)).map(e=>e.date)).size;
  const left=s.net-s.home+s.homeInc;
  let pl=`<tr><th>本月</th><th class="r">金額</th></tr>`;
  pl+=`<tr><td>店的營收${openDays?`<div class="sub">營業 ${openDays} 天，平均一天 ${money(s.inc/openDays)}</div>`:""}</td><td class="r num c-in">${money(s.inc)}</td></tr>`;
  pl+=`<tr><td>店的支出</td><td class="r num c-out">−${money(s.store)}</td></tr>`;
  pl+=`<tr><td><b>店賺</b></td><td class="r num ${s.net<0?"c-out":""}">${money(s.net)}</td></tr>`;
  pl+=`<tr><td>家用支出</td><td class="r num c-out">−${money(s.home)}</td></tr>`;
  if(s.homeInc) pl+=`<tr><td>家用收入</td><td class="r num c-in">${money(s.homeInc)}</td></tr>`;
  pl+=`<tr class="total"><td>本月剩下<div class="sub">店賺 − 家用支出${s.homeInc?" ＋ 家用收入":""}</div></td><td class="r num ${left<0?"c-out":"c-in"}">${money(left)}</td></tr>`;
  $("pl").innerHTML=pl;
  for(const [id,book,tot] of [["catStore","store",s.store],["catHome","home",s.home]]){
    const by=s.byCat[book];
    const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]);
    let h=`<tr><th>類別</th><th class="r">金額</th><th class="r">佔比</th></tr>`;
    if(!rows.length) h+=`<tr><td colspan="3" class="muted">這個月還沒有${book==="home"?"家用":"店"}的支出</td></tr>`;
    for(const [n,v] of rows){ const p=tot?v/tot*100:0; h+=`<tr><td class="barcell" style="--w:${p}%">${esc(n)}</td><td class="r num c-out">${money(v)}</td><td class="r muted">${Math.round(p)}%</td></tr>`; }
    if(rows.length) h+=`<tr class="total"><td>合計</td><td class="r num c-out">${money(tot)}</td><td></td></tr>`;
    $(id).innerHTML=h;
  }
  const days={}; for(const e of list) (days[e.date]=days[e.date]||[]).push(e);
  const keys=Object.keys(days).sort();
  $("daily").innerHTML = keys.length ? keys.map(d=>{ const x=sums(days[d]); return `<tr><td>${dayLabel(d)}</td><td class="r num c-in">${money(x.inc)}</td><td class="r num c-out">${money(x.store)}</td><td class="r num ${x.net<0?"c-out":""}">${money(x.net)}</td><td class="r num c-out">${money(x.home)}</td></tr>`; }).join("")
    : `<tr><td colspan="5" class="muted" style="text-align:center">這個月還沒有帳</td></tr>`;
}

// ---------- 帳戶 ----------
function renderAccts(){
  const f=currentFlows();
  let assets=0, debts=0;
  for(const a of S.accounts){ if(!a.counted) continue; const b=balanceOf(a,f); if(a.debt) debts+=b; else assets+=b; }
  const net=assets+debts;
  $("aNet").textContent=(net<0?"−$":"$")+money2(Math.abs(net)); $("aNet").className="num "+(net<0?"c-out":"c-in");
  $("aAssets").textContent=money2(assets); $("aAssets").className="num "+(assets<0?"c-out":"");
  $("aDebts").textContent=money2(Math.abs(debts));
  // 本月收支跟天天記帳一樣：只算「計入資產」的帳戶這個月的進出
  const counted=new Set(S.accounts.filter(a=>a.counted).map(a=>a.name));
  let m=0; for(const e of monthEntries(ymOf(todayStr()))){ const x=effectOf(e); for(const k in x) if(counted.has(k)) m+=x[k]; }
  $("aMonth").textContent=money(m); $("aMonth").className="num "+(m<0?"c-out":"c-in");
  const t=$("acctList");
  t.innerHTML=`<tr><th>帳戶</th><th class="r">餘額</th></tr>`+S.accounts.map((a,i)=>{ const b=balanceOf(a,f);
    return `<tr class="row" data-i="${i}"><td><span class="item">${esc(a.name)}</span>${a.debt?'<span class="atag">負債型</span>':""}${a.counted?"":'<span class="atag">不計入資產</span>'}</td><td class="r num ${b<0?"c-out":"c-in"}">${money2(b)}</td></tr>`; }).join("");
  for(const tr of t.querySelectorAll("tr.row")) tr.onclick=()=>openAcct(S.accounts[+tr.dataset.i]);
  renderAcctEdit();
}
function openAcct(a){
  S.acctEdit = a ? {...a, isNew:false, orig:a.name} : {name:"",opening:0,debt:false,counted:true,isNew:true};
  S.acctDelArm=false;
  $("acName").value=S.acctEdit.name; $("acName").disabled=!S.acctEdit.isNew;
  $("acBal").value = a ? String(Math.round(balanceOf(a)*100)/100) : "";
  $("acDebt").checked=!!S.acctEdit.debt; $("acCounted").checked=!!S.acctEdit.counted;
  renderAcctEdit(); $("acctEdit").scrollIntoView({block:"nearest"});
}
function renderAcctEdit(){
  const e=S.acctEdit; $("acctEdit").hidden=!e; if(!e) return;
  $("acTitle").textContent=e.isNew?"新增帳戶":"修改「"+e.orig+"」";
  $("acDel").hidden=e.isNew; $("acDel").textContent=S.acctDelArm?"確定刪除？":"刪除";
}
function saveAccts(next,msg){ S.accounts=next; lsSet("accounts",next); S.acctEdit=null; queue({type:"accts",accounts:next}); toast(msg); }
$("acCancel").onclick=()=>{ S.acctEdit=null; renderAcctEdit(); };
$("acOk").onclick=()=>{
  const e=S.acctEdit; if(!e) return;
  const name=$("acName").value.trim().replace(/\s+/g," ");
  if(!name){ toast("請輸入帳戶名稱"); return; }
  if(e.isNew && acctNames().includes(name)){ toast("已經有「"+name+"」了"); return; }
  const raw=$("acBal").value.replace(/[,\s]/g,""); const bal = raw==="" ? null : Number(raw);
  if(raw!=="" && !isFinite(bal)){ toast("餘額請輸入數字"); return; }
  const f=currentFlows();
  const a={name, debt:$("acDebt").checked, counted:$("acCounted").checked, opening: bal==null ? (e.isNew?0:e.opening) : bal-(f[name]||0)};
  saveAccts(e.isNew ? [...S.accounts,a] : S.accounts.map(x=>x.name===e.orig?a:x), e.isNew?"已新增「"+name+"」":"已更新「"+name+"」");
};
$("acDel").onclick=()=>{
  const e=S.acctEdit; if(!e||e.isNew) return;
  if(Math.abs(currentFlows()[e.orig]||0)>0.001){ toast("這個帳戶還有記帳，不能刪除"); return; }
  if(!S.acctDelArm){ S.acctDelArm=true; renderAcctEdit(); return; }
  saveAccts(S.accounts.filter(x=>x.name!==e.orig),"已刪除「"+e.orig+"」");
};
$("acAdd").onclick=()=>openAcct(null);
$("acTransfer").onclick=()=>{ resetForm(); showTab("add"); setType("tr"); };

// ---------- 共用 ----------
function renderSync(){
  const n=S.outbox.filter(o=>o.type==="put"||o.type==="del").length;
  const el=$("sync");
  el.className="dot"+((n||!S.online)?" wait":"");
  el.title = n ? n+" 筆還沒傳到試算表" : !S.online ? "沒有網路，顯示的是上次的資料" : "已同步到 Google 試算表";
}
// 記帳人＝帳本最上面選的人（禎／雅），記一筆時自動記上，不用另外選
function renderWho(){ for(const b of document.querySelectorAll("#who button")) b.classList.toggle("on",b.dataset.who===S.who); }
for(const b of document.querySelectorAll("#who button")) b.onclick=()=>{ S.who=b.dataset.who; lsSet("who",S.who); renderWho(); };
function renderAll(){ renderList(); renderRep(); renderAccts(); renderSync(); }

function showTab(t){
  S.tab=t;
  for(const b of document.querySelectorAll("nav.tabs button")) b.classList.toggle("on",b.dataset.tab===t);
  for(const id of ["add","list","rep","acct","set"]) $("tab-"+id).hidden = t!==id;
  document.querySelector(".bar").hidden = t==="add";
  lsSet("tab",t);
}
for(const b of document.querySelectorAll("nav.tabs button")) b.onclick=()=>showTab(b.dataset.tab);
function goMonth(which,k){
  S[which]=shiftYm(S[which],k);
  if(which==="listYm") S.selDay = S.listYm===ymOf(todayStr()) ? todayStr() : S.listYm+"-01";
  renderAll(); flush();
}
$("mPrev").onclick=()=>goMonth("listYm",-1); $("mNext").onclick=()=>goMonth("listYm",1);
$("rPrev").onclick=()=>goMonth("repYm",-1);  $("rNext").onclick=()=>goMonth("repYm",1);

$("sheet").onclick=()=>{ if(S.sheetUrl) window.open(S.sheetUrl,"_blank"); else toast("還沒連上試算表"); };
$("csv").onclick=async()=>{
  const list=[...monthEntries(S.repYm)].sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
  if(!list.length){ toast("這個月沒有資料"); return; }
  const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
  const lines=[["日期","收支","店/家用","類別","品項","備註","金額","帳戶","記帳人"].join(",")];
  for(const e of list) lines.push([e.date,e.type==="in"?"收入":e.type==="tr"?"轉帳":"支出",e.type==="tr"?"":isHome(e)?"家用":"店",e.cat,e.type==="tr"?"":itemOf(e),e.type==="tr"?e.note:memoOf(e),e.amount,e.pay,e.who].map(q).join(","));
  const name="巷口小食_"+S.repYm+".csv";
  const file=new File(["﻿"+lines.join("\r\n")],name,{type:"text/csv"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})) await navigator.share({files:[file], title:name});
    else { const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
  }catch(_){}
};
$("logout").onclick=()=>{
  if(!$("logout").dataset.arm){ $("logout").dataset.arm="1"; $("logoutHint").textContent="再按一次確認"; setTimeout(()=>{ delete $("logout").dataset.arm; $("logoutHint").textContent="›"; },4000); return; }
  S.pin=""; lsSet("pin",""); showSetup();
};

// ---------- 第一次設定 ----------
function showSetup(msg){
  $("setup").hidden=false; $("app").hidden=true;
  $("setupMsg").textContent=msg||""; $("setupMsg").hidden=!msg;
}
$("setupOk").onclick=async()=>{
  const pin=$("pinIn").value.trim();
  if(!/^\d{4,10}$/.test(pin)){ $("setupMsg").textContent="請輸入試算表「設定」頁的數字"; $("setupMsg").hidden=false; return; }
  $("setupOk").disabled=true; $("setupOk").textContent="確認中…";
  S.pin=pin;
  try{
    const j=await api("ping"); S.sheetUrl=j.sheetUrl; lsSet("sheetUrl",S.sheetUrl); lsSet("pin",pin);
    $("setup").hidden=true; $("app").hidden=false; toast("連上了！"); flush();
  }catch(e){
    S.pin="";
    $("setupMsg").textContent = e.code==="pin" ? "密碼不對，請再看一次試算表「設定」頁 B1 格" : e.code==="locked" ? "打錯太多次，請 10 分鐘後再試" : "連不上，請確認手機有網路";
    $("setupMsg").hidden=false;
  }
  $("setupOk").disabled=false; $("setupOk").textContent="開始記帳";
};

// ---------- 啟動 ----------
$("date").value=todayStr();
defaultPay();
renderWho(); renderAdd(); renderAll();
showTab(["add","list","rep","acct","set"].includes(lsGet("tab","add"))?lsGet("tab","add"):"add");
if(!S.pin) showSetup(); else flush();
setInterval(()=>{ if(document.visibilityState==="visible") flush(); }, 30000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ if(!S.edit && $("date").value!==todayStr() && !S.expr) { $("date").value=todayStr(); renderAdd(); } flush(); } });
addEventListener("online",flush);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
