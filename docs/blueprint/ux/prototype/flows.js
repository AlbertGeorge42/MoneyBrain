/* ============================================================
   MoneyBrain · 线框级原型 · 流程控制
   ============================================================ */

/* ================= 导航 ================= */
const NAV=[['dash','总览',I.dash],['txns','流水',I.list],['reports','报表',I.rep],['budgets','预算',I.budget],['settings','设置',I.set]];
const NAV_KEY={dash:'1',txns:'2',reports:'3',budgets:'4',settings:'5'};
/* 第六轮：点遮罩关闭 —— 此前遮罩从未绑定点击事件（纯展示层），
   "点遮罩关不掉"的根因即此。绑定一次，点击即关闭对应浮层。 */
$('#veil').addEventListener('click', ()=>closeOverlay());
$('#mVeil').addEventListener('click', ()=>closeOverlay());
$('#entryVeil').addEventListener('click', ()=>closeEntry());
$('#mEntryVeil').addEventListener('click', ()=>closeEntry());
function renderNav(){
  $('#pcNav').innerHTML = NAV.map(([k,l,ic])=>
    `<button class="nav-item ${S.view===k?'on':''}" onclick="go('${k}')">${ic}<span>${l}</span><span class="kbd">${NAV_KEY[k]}</span></button>`).join('');
}
function renderTabbar(){
  /* 底栏 5 项与 PC 一级导航数量相同，不做删减；FAB 不占导航槽位 */
  $('#mTabbar').innerHTML = NAV.map(([k,l,ic])=>
    `<button class="m-tab ${S.view===k?'on':''}" ${S.view===k?'aria-current="page"':''} onclick="go('${k}')">${ic}<span>${l}</span></button>`).join('');
}
function go(v){
  S.view=v;
  if(S.batch) toggleBatch();
  render();
  const scroller = S.device==='pc' ? $('#pcView') : document.querySelector('.m-screen');
  if(scroller) scroller.scrollTop=0;
}
function setDevice(d){ S.device=d; S.batch=false; S.sel.clear(); S.periodPop=false; syncSegs(); render(); }
function setDataState(s){ S.dataState=s; syncSegs(); render(); }
/* 工具条的三态与设备切换要反映当前状态，否则切回来会看到错的选中态 */
function syncSegs(){
  const dev=$('#devSeg'), st=$('#stateSeg');
  if(dev) [...dev.children].forEach((b,i)=>b.classList.toggle('on',(i===0)===(S.device==='pc')));
  if(st) [...st.children].forEach((b,i)=>b.classList.toggle('on',['normal','loading','empty','noresult','error'][i]===S.dataState));
}

/* ================= 渲染入口 ================= */
/* 浮层归属：PC 的 Toast / 批量条挂视口，移动端必须挂进手机壳内部，
   否则它们会飘在手机壳外、压住底栏 */
function mountOverlays(){
  const phone=document.querySelector('.phone');
  const layer=$('#toasts'), bar=$('#batchBar');
  if(S.device==='m'){ phone.appendChild(layer); phone.appendChild(bar); }
  else { document.body.appendChild(layer); document.body.appendChild(bar); }
}
function render(){
  document.body.dataset.device = S.device;
  document.body.classList.toggle('batch', S.batch);
  document.body.classList.toggle('dense', S.txDensity==='compact');
  mountOverlays();
  renderNav(); renderTabbar();
  $('#pcView').innerHTML = VIEWS[S.view]('pc');
  $('#mView').innerHTML = VIEWS[S.view]('m');
  const flow = TXNS.reduce((s,t)=>s+txFlow(t),0);
  const sf=$('#sideFlow'); if(sf) sf.textContent=`${flow>=0?'+':'−'}¥${abs(flow)}`;
  renderBatchBar();
  renderOverlay();
  syncEntryShell();
  writeUrlState();
}
function syncEntryShell(){
  const pc=$('#entryPc'), m=$('#entryM');
  if(!S.entryOpen){ pc.classList.remove('open'); m.classList.remove('open'); return; }
  const box = S.device==='m' ? m : pc;
  (S.device==='m' ? pc : m).classList.remove('open');
  box.classList.add('open');
  entryVeil().classList.add('open');
  if(S.entryDevice!==S.device){ S.entryDevice=S.device; renderEntry(); }
}
/* S3/S4：批量条按「复杂度 × 频率」收敛 —— 删除为主入口（评审轮 T2：先弹二次确认层）、
   改分类降级进「⋯ 更多」下拉（评审轮 P4：文案只留「改分类」，设计理由见概念稿 §8.14）。 */
function renderBatchBar(){
  const bar=$('#batchBar');
  const n=S.sel.size;
  bar.innerHTML = S.batch ? `
    <span class="num">已选 ${n} 笔</span>
    <button class="bb-btn warn" onclick="openOverlay('batchdel')">删除 ${n} 笔</button>
    <span class="bb-more-wrap">
      <button class="bb-btn" onclick="toggleBatchMore()" aria-expanded="${S.batchMore}" aria-label="更多批量操作">⋯ 更多</button>
      ${S.batchMore?`<span class="bb-menu">
        <button class="bb-mi" onclick="openOverlay('catpick',{ids:Array.from(S.sel)})">改分类</button>
      </span>`:''}
    </span>
    <button class="bb-btn" onclick="toggleBatch()">退出</button>`
    : `<span style="opacity:.8">勾选流水后可批量操作 · Esc 退出</span>`;
  bar.classList.toggle('show', S.batch);
}
function toggleBatchMore(){
  S.batchMore=!S.batchMore;
  renderBatchBar();
}

/* ================= 记账（UX2 · W1） ================= */
const entryVeil = () => S.device==='m' ? $('#mEntryVeil') : $('#entryVeil');
const entryHost = () => S.device==='m' ? $('#entryM') : $('#entryPc');
function openEntry(){
  if(S.entryOpen) return;
  S.entryOpen=true; S.entryDevice=S.device;
  S.entryType='expense'; S.entryCat='food'; S.entryCatPicked=false; S.entryAmt=''; S.entryNote='';
  S.entryFee=''; S.entryCoupon=''; S.entryAcc=null; S.entryMore=false;
  S.savedCount=0; S.savedSum=0;
  document.body.dataset.device = S.device;
  entryVeil().classList.add('open');
  renderEntry();
  entryHost().classList.add('open');
  if(S.device==='pc') setTimeout(()=>$('#entryPc input.amt-f')?.focus(),60);
}
/* 评审轮 T6：关闭时若已填内容 → 快照草稿并发「草稿已丢弃 · 撤销」toast（撤销 = 重开并恢复草稿）；
   空表单关闭不发。保存路径先清空字段再关，避免误报。 */
function entryHasDraft(){
  return !!(S.entryAmt||S.entryNote||S.entryFee||S.entryCoupon
    ||S.entryCatPicked||(S.entryDate&&S.entryDate!==today));
}
function closeEntry(){
  const had=entryHasDraft();
  const draft=had?{type:S.entryType,cat:S.entryCat,catPicked:S.entryCatPicked,amt:S.entryAmt,
    note:S.entryNote,fee:S.entryFee,coupon:S.entryCoupon,date:S.entryDate,acc:S.entryAcc,
    toAcc:S.entryToAcc,more:S.entryMore,savedCount:S.savedCount,savedSum:S.savedSum}:null;
  document.activeElement && document.activeElement.blur();
  $('#entryVeil').classList.remove('open');
  $('#mEntryVeil').classList.remove('open');
  $('#entryPc').classList.remove('open'); $('#entryM').classList.remove('open');
  S.entryOpen=false;
  if(had){
    toast('草稿已丢弃','撤销',()=>{
      openEntry();
      S.entryType=draft.type; S.entryCat=draft.cat; S.entryCatPicked=draft.catPicked;
      S.entryAmt=draft.amt; S.entryNote=draft.note; S.entryFee=draft.fee; S.entryCoupon=draft.coupon;
      S.entryDate=draft.date; S.entryAcc=draft.acc; S.entryToAcc=draft.toAcc; S.entryMore=draft.more;
      S.savedCount=draft.savedCount; S.savedSum=draft.savedSum;
      renderEntry();
    });
  }
}
function entryTypeList(){ return ['expense','income','transfer','refund','adjustment']; }
function entryTypeSeg(device){
  return `<div class="type-seg">${entryTypeList().map(t=>
    `<button class="${S.entryType===t?'on':''}" onclick="setType('${t}')">${TYPE_CN[t]}</button>`).join('')}</div>`;
}
/* 记账分类选择 —— 第八轮：移动端改回网格两行铺满全部一级分类（不允许横向滚动，
   空间不够用紧凑 padding/字号解决）；二级沿用与 PC 一致的折行 chips，可点。 */
function entryCatGrid(device){
  const defs=CATS[catType(S.entryType)]||[];
  const top=defs.filter(c=>!c[2]);
  const kids=catChildrenOf(S.entryType,S.entryCat);
  const grid=`<div class="cat-grid ${device==='m'?'m-cat-grid':''}">${top.map((c,i)=>
    `<button class="cat-cell ${S.entryCat===c[0]?'on':''}" onclick="setCat('${c[0]}')">
      <span class="key">${i+1}</span>${catGlyph(c[1])}<span class="nm">${c[1]}</span></button>`).join('')}</div>`;
  if(!kids.length) return grid;
  return grid+`<div class="cat-sub-row"><span class="lbl">${catName(S.entryType,S.entryCat)} · 二级</span>
    ${kids.map(c=>`<button class="cat-sub ${S.entryCat===c[0]?'on':''}" onclick="setCat('${c[0]}')">${catGlyph(c[1])}${c[1]}</button>`).join('')}</div>`;
}
/* 第十轮（换账户稳定性）：账户选择 = 常驻单行横向 chips（两端同构）——
   点击即切换、不展开面板。原「pill + 展开式 acct-picker」实测展开时抽屉撑高 186px
   （588→774），是「换账户窗口变化」的根因；chips 常驻后切换前后高度 / 滚动状态零变化。
   第十一轮（账户扩容分级）：chips 只放「最近使用 + 当前选中」的前 ACC_QUICK 个，
   行尾「全部账户 ›」打开固定高度二级抽屉（accpick：搜索 + 按分类分组 + 内部滚动），
   选完回原位置 —— 账户 5 / 12 / 20 个时外层抽屉高度、滚动区、记账区位置三者不变。
   方案对比与取舍见 concept-design.md W1（第十轮选 A；第十一轮 A+分级兜底）。 */
const ACC_QUICK=5;
function quickAccIds(sel){
  const rec=(S.recentAccs||[]).filter(id=>ACC.some(a=>a.id===id));
  const ids=sel&&ACC.some(a=>a.id===sel)&&!rec.includes(sel)?[sel,...rec]:[...rec];
  for(const a of ACC){ if(ids.length>=ACC_QUICK) break; if(!ids.includes(a.id)) ids.push(a.id); }
  return ids.slice(0,ACC_QUICK);
}
function entryAccountLine(device){
  const chips=(sel,fn)=>{
    const quick=quickAccIds(sel);
    const more=ACC.length>quick.length;
    return `<div class="acct-chips">${quick.map(id=>{const a=ACC.find(x=>x.id===id);
      if(!a) return ''; return `<button class="acct-chip ${a.id===sel?'on':''}" onclick="${fn}('${a.id}')" aria-label="账户 ${a.name}"><span class="dot"></span>${a.name}</button>`;}).join('')}
      ${more?`<button class="acct-chip acct-chip-more" onclick="openAccPicker('${fn}')" aria-label="全部账户">全部账户 ›</button>`:''}</div>`;
  };
  if(S.entryType==='transfer')
    return `<div class="acct-line acct-line-col">
      <div class="acct-chip-row"><span class="lbl acct-lbl">转出</span>${chips(S.entryAcc||'cmb','pickAcc')}</div>
      <div class="acct-chip-row"><span class="lbl acct-lbl">转入</span>${chips(S.entryToAcc||'brk','pickToAcc')}</div>
    </div>`;
  return `<div class="acct-line">${chips(S.entryAcc||'cmb','pickAcc')}</div>`;
}
function entryMorePanel(device){
  return `<div class="more-panel ${S.entryMore?'open':''}">
    <div class="field"><label>手续费</label><input value="${S.entryFee}" oninput="S.entryFee=this.value"></div>
    <div class="field"><label>优惠券</label><input value="${S.entryCoupon}" oninput="S.entryCoupon=this.value"></div>
    <div class="field"><label>日期</label><input type="date" value="${S.entryDate||today}" onchange="S.entryDate=this.value"></div>
    <div class="field"><label>备注</label><input value="${S.entryNote}" oninput="S.entryNote=this.value" placeholder="备注"></div>
  </div>`;
}
/* 移动端抽屉三段式：头（两行）/ 滚动区 / 底部固定（键盘 + 主按钮） */
function entryMobileHead(){
  /* Q4（按推荐值 A）：抽屉头分两行 —— 上行「记一笔 ✕」，下行左「已连记 N 笔」右「第 N 笔 · 合计」 */
  return `<div class="m-entry-head">
    <div class="m-entry-title"><h3>记一笔</h3><button class="icon-btn" onclick="closeEntry()" aria-label="关闭">${I.x}</button></div>
    <div class="m-entry-count">
      <span>已连记 ${S.savedCount} 笔</span>
      <span>${S.savedCount?`第 ${S.savedCount} 笔 · 合计 ¥${fmt(S.savedSum)}`:'—'}</span>
    </div>
  </div>`;
}
function renderEntry(){
  const amtTxt = S.entryAmt?S.entryAmt:'0';
  const pc=$('#entryPc');
  /* 第八轮：删除「3 步完成」步骤示意（步骤条 + 步骤文字）—— 金额/分类/保存的
     顺序由界面自身表达，不占头部空间，也不加替代装饰。 */
  pc.innerHTML = `
    <div class="sp-head"><h2>记一笔</h2><button class="icon-btn" onclick="closeEntry()" aria-label="关闭">${I.x}</button><span style="font-size:var(--mb-fs-0);color:var(--mb-ink-3);margin-left:8px">${S.savedCount?`已连记 ${S.savedCount} 笔`:''}</span></div>
    ${entryTypeSeg('pc')}
    <div class="amt-input"><span class="cur">¥</span><input class="amt-f" inputmode="decimal" value="${S.entryAmt}" placeholder="0.00" oninput="S.entryAmt=this.value;renderEntry()"></div>
    ${entryCatGrid('pc')}
    ${entryAccountLine('pc')}
    <button class="more-toggle" onclick="toggleMore()">手续费 / 优惠券 / 日期 / 备注 ▾</button>
    ${entryMorePanel('pc')}
    <div class="entry-actions">
      <button class="btn ghost" onclick="closeEntry()">取消</button>
      <button class="btn" onclick="saveEntry(false)">保存</button>
      <button class="btn primary" onclick="saveEntry(true)">保存并再记 ⏎</button>
    </div>`;
  const m=$('#entryM');
  m.innerHTML = `
    ${entryMobileHead()}
    <div class="m-entry-scroll">
      ${entryTypeSeg('m')}
      <div class="amt-input"><span class="cur">¥</span><input class="amt-f" readonly value="${amtTxt}" tabindex="-1"></div>
      ${entryCatGrid('m')}
      ${entryAccountLine('m')}
      <button class="more-toggle" onclick="toggleMore()">手续费 / 优惠券 / 日期 / 备注 ▾</button>
      ${entryMorePanel('m')}
    </div>
    <div class="m-entry-foot">
      <div class="keypad">
        ${['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k=>
          `<button onclick="keyPad('${k}')" aria-label="${k}">${k}</button>`).join('')}
      </div>
      <div class="m-entry-save">
        <button class="btn ghost" onclick="closeEntry()">取消</button>
        <button class="btn primary" onclick="saveEntry(true)">保存并再记</button>
      </div>
    </div>`;
}
function setType(t){ S.entryType=t; S.entryCat=(CATS[catType(t)]||[])[0]?.[0]||null; S.entryCatPicked=false; renderEntry(); }
function setCat(c){ S.entryCat=c; S.entryCatPicked=true; renderEntry(); }
function toggleMore(){ S.entryMore=!S.entryMore; renderEntry(); }
/* pickAcc / pickToAcc：切换 + 记入最近使用（分级 chips 的排序依据） */
function pickAcc(id){ S.entryAcc=id; touchRecentAcc(id); renderEntry(); }
function pickToAcc(id){ S.entryToAcc=id; touchRecentAcc(id); renderEntry(); }
function touchRecentAcc(id){
  S.recentAccs=[id, ...(S.recentAccs||[]).filter(x=>x!==id)].slice(0,ACC_QUICK);
}
/* 第十一轮：全部账户二级抽屉（accpick）—— 从记账抽屉里开一层，
   固定高度 + 搜索 + 按分类分组 + 内部滚动；选完回原抽屉，外层高度不变 */
function openAccPicker(fn){
  S.accPickFn=fn; S.accPickQ='';
  openOverlay('accpick');
}
function accPickInput(v){ S.accPickQ=v; renderOverlay(); }
function accPickChoose(id){
  const fn=S.accPickFn||'pickAcc';
  S.accPickFn=null; S.accPickQ='';
  closeOverlay();
  touchRecentAcc(id);
  if(fn==='pickToAcc') S.entryToAcc=id; else S.entryAcc=id;
  renderEntry();
}
function keyPad(k){
  if(k==='⌫') S.entryAmt = S.entryAmt.slice(0,-1);
  else if(k==='.'){ if(!S.entryAmt.includes('.')) S.entryAmt = (S.entryAmt||'0')+'.'; }
  else S.entryAmt = (S.entryAmt||'')+k;
  renderEntry();
}
function saveEntry(keepGoing){
  const amt=parseFloat(S.entryAmt);
  if(!amt || amt<=0){ toast('先填金额','提示'); return; }
  const t={
    id:'n'+Date.now(), date:S.entryDate||today, type:S.entryType, cat:S.entryCat||'other',
    note:S.entryNote||'', acc:S.entryAcc||'cmb', amt,
  };
  if(S.entryFee) t.fee=parseFloat(S.entryFee);
  if(S.entryCoupon) t.coupon=parseFloat(S.entryCoupon);
  TXNS.unshift(t);
  S.savedCount++; S.savedSum+=amt;
  /* T7：撤销闭包随 toast 走 —— 每个 toast 撤自己那一次操作 */
  const undoSave=()=>{ const i=TXNS.indexOf(t); if(i>=0){ TXNS.splice(i,1); render(); } };
  if(keepGoing){
    /* 连记：保留账户与分类，只清金额 */
    S.entryAmt='';
    renderEntry();
    toast(`第 ${S.savedCount} 笔已入账 · ¥${fmt(amt)}`,'撤销',undoSave);
  }else{
    /* 先清空已填字段再关闭 —— 保存成功不是「草稿丢弃」 */
    S.entryAmt=''; S.entryNote=''; S.entryFee=''; S.entryCoupon=''; S.entryCatPicked=false;
    closeEntry();
    toast(`已记一笔 · ¥${fmt(amt)}`,'撤销',undoSave);
  }
  render();
}

/* ================= 流水交互 ================= */
function rowClick(id){
  if(S.batch){ toggleSel(id); return; }
  openTx(id,'detail');
}
function toggleSel(id){
  S.sel.has(id)?S.sel.delete(id):S.sel.add(id);
  render();
}
function clearSel(){ S.sel.clear(); render(); }
function toggleBatch(){
  S.batch=!S.batch;
  if(!S.batch) S.sel.clear();
  render();
}
/* 评审轮 P5：单笔删除成功后自动关闭详情面板/抽屉，不停留在「这笔已不存在」墓碑态；
   撤销闭包随 toast（T7）。
   第十八轮：与预算条目对齐 —— 两步确认（第一次点击只换文案，第二次才执行）。 */
function delTx(id){
  if(S.txConfirm!==id){ S.txConfirm=id; renderOverlay(); return; }
  const i=TXNS.findIndex(t=>t.id===id);
  if(i<0) return;
  const [removed]=TXNS.splice(i,1);
  S.txConfirm=null;
  closeOverlay();
  render();
  toast('已删除 1 笔','撤销',()=>{ TXNS.splice(Math.min(i,TXNS.length),0,removed); render(); });
}
/* 搜索框输入时不整页重绘 —— 否则输入框会被重建、焦点与光标丢失 */
function onSearch(v){
  S.search=v;
  S.txPage=1;
  const pc=$('#txListPc'), m=$('#txListM');
  if(pc) pc.innerHTML=txList('pc');
  if(m) m.innerHTML=txList('m');
  const act=$('#activeFilterBarPc'), actM=$('#activeFilterBarM');
  if(act) act.innerHTML=activeFilterBar();
  if(actM) actM.innerHTML=activeFilterBar();
  /* P3：页头「共 N 笔」跟随筛选（与统计条同一口径） */
  const cnt=$('#txnCountPc');
  if(cnt) cnt.textContent=filteredCount();
}
/* S2：分页。页码是纯 UI 状态，不写进 URL（报表口径才进 URL） */
function setTxPage(n){ S.txPage=n; render(); }
/* O6：列表密度入口在 设置›列表显示（setDensity 在 app.js），此处只保留读取。 */
function readDensity(){
  try{ const v=localStorage.getItem('mb.txDensity'); if(v==='compact'||v==='normal') S.txDensity=v; }catch(e){}
}
function setTypeFilter(t){ S.typeFilter=t; S.txPage=1; render(); }
/* PC：筛选是工具栏下方的内联面板；移动端：筛选走底部抽屉（与时间选择同一手势） */
function toggleFilter(){ S.filterOpen=!S.filterOpen; render(); }
function openFilter(){ if(S.device==='m') openOverlay('filter'); else toggleFilter(); }
function setFilter(k,v){ S.filters[k]=v; S.txPage=1; render(); }
function resetFilters(){ S.filters={acc:'',cat:'',min:'',max:'',from:'',to:''}; S.typeFilter=undefined; S.txPage=1; render(); }
function clearAllFilters(){ S.search=''; S.typeFilter=undefined; resetFilters(); }

/* ================= 报表 / 预算 / 设置 ================= */
function setRepTab(t){ S.repTab=t; S.repSide='a'; render(); }
function setRepSide(s){ S.repSide=s; render(); }
/* 报表表格折叠：父行折叠子行。折叠只影响可见性，不改变表尾合计（口径写在表下说明） */
function toggleFold(key){
  S.folded.has(key)?S.folded.delete(key):S.folded.add(key);
  render();
}
/* 第十四轮：‹ › 步进按粒度一桶（时点报表同样有粒度；时点步进后仍锚定月末/年末）。
   步进 = 已生效值变更（清预设名/自定义），不经草稿。 */
function shiftTime(dir){
  const t=S.repTime;
  const g=S.timeGran;
  const point=isPointReport();
  if(g==='day'){
    const dt=new Date(t.y,t.m-1,t.d);
    dt.setDate(dt.getDate()+dir);
    S.repTime={y:dt.getFullYear(),m:dt.getMonth()+1,d:dt.getDate()};
  }else if(g==='month'){
    let m=t.m+dir,y=t.y;
    if(m<1){m=12;y--;} if(m>12){m=1;y++;}
    S.repTime={y,m,d:1};
  }else{
    S.repTime={y:t.y+dir,m:1,d:1};
  }
  if(point) S.repTime=snapPointToGran(S.repTime);
  S.repLabel=null; S.repRange=null;
  render();
}
/* setSub 已删（第十轮）：移动端通用项二级页统一走 overlay 全屏页（见 app.js viewSettings） */

/* ================= S8 · 报表口径状态写进 URL（可分享） ================= */
/* 视图 / 报表 tab / 期间 / 移动端侧栏 —— 这四项是「口径」，分享链接必须能复现。
   页面状态（分页、搜索词、浮层）不进 URL。 */
function writeUrlState(){
  const q=new URLSearchParams();
  q.set('v',S.view); q.set('t',S.repTab);
  q.set('y',S.repTime.y); q.set('m',S.repTime.m); q.set('d',S.repTime.d);
  q.set('g',S.timeGran); q.set('s',S.repSide);
  const u=`${location.pathname}?${q.toString()}`;
  try{ history.replaceState(null,'',u); }
  catch(e){ location.hash=q.toString(); }   /* file:// 下 replaceState 可能被拒 */
}
function readUrlState(){
  const raw=(location.search||'').replace(/^\?/,'')||(location.hash||'').replace(/^#/,'');
  if(!raw) return;
  const q=new URLSearchParams(raw);
  const v=q.get('v'); if(v&&['dash','txns','reports','budgets','settings'].includes(v)) S.view=v;
  const t=q.get('t'); if(t&&['balance','flow','cash','invest'].includes(t)) S.repTab=t;
  const y=+q.get('y'), m=+q.get('m'), d=+q.get('d');
  if(y>2000&&m>=1&&m<=12&&d>=1&&d<=31){ S.repTime={y,m,d}; S.repLabel=null; S.repRange=null; }
  const g=q.get('g'); if(['day','month','year'].includes(g)) S.timeGran=g;
  if(q.get('t')==='balance') S.repTime=snapPointToGran(S.repTime);
  const s=q.get('s'); if(s==='a'||s==='b'||s==='c') S.repSide=s;
}

/* ================= Toast ================= */
/* Q2（按推荐值 A）：PC 右下角浮层；移动端落状态栏下方顶部横幅，
   由 CSS `.phone .toast-layer` 定位 —— 唯一不与底栏/FAB/抽屉/批量条冲突的位置。
   评审轮 T7：每个 toast 各自持独立撤销闭包 —— 点哪条 toast 撤的就是那一次操作，
   互不覆盖；窗口 6 秒（线框取值）。无撤销动作时按钮只做关闭。 */
function toast(msg,actLabel,undoFn){
  const layer=$('#toasts');
  const el=document.createElement('div');
  el.className='toast';
  el.innerHTML=`<span>${msg}</span>${actLabel?`<button class="act">${actLabel}</button>`:''}`;
  if(actLabel){
    el.querySelector('.act').addEventListener('click',()=>{
      el.remove();
      if(typeof undoFn==='function') undoFn();
    });
  }
  layer.appendChild(el);
  setTimeout(()=>el.remove(),6000);
}

/* ================= 说明面板 ================= */
function toggleNotes(){
  S.notesOpen=!S.notesOpen;
  $('#notes').classList.toggle('open',S.notesOpen);
}

/* ================= 键盘（PC 优先） ================= */
document.addEventListener('keydown',e=>{
  if(S.device!=='pc') return;
  const tag=(e.target.tagName||'').toLowerCase();
  const typing = tag==='input'||tag==='textarea'||tag==='select';
  if(e.key==='Escape'){
    if(S.notesOpen) return toggleNotes();
    if(S.entryOpen) return closeEntry();
    if(S.overlay) return closeOverlay();
    if(S.batch) return toggleBatch();
    return;
  }
  if(typing) return;
  if(e.key==='n'||e.key==='N'){ e.preventDefault(); openEntry(); return; }
  if(e.key==='/'){ e.preventDefault(); go('txns'); setTimeout(()=>$('#pcView input')?.focus(),50); return; }
  if(['1','2','3','4','5'].includes(e.key) && !S.entryOpen && !S.overlay){
    e.preventDefault(); go(NAV[+e.key-1][0]); return;
  }
});
