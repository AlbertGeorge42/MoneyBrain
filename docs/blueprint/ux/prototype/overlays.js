/* ============================================================
   MoneyBrain · 线框级原型 · 浮层
   ------------------------------------------------------------
   一份内容，两处外壳（concept-design.md W4）：
   PC 承载 = 右侧面板 / 居中弹层；移动端承载 = 底部抽屉。
   ============================================================ */

/* 浮层清单：kind 决定 PC 承载（panel=右侧面板 / modal=居中弹层） */
const OV = {
  tx:      {kind:'panel', title:'交易详情', render:txOverlay},
  catpick: {kind:'modal', title:'批量改分类', render:catPickOverlay},
  budget:  {kind:'panel', title:'预算', render:budgetOverlay},
  drill:   {kind:'panel', title:'分类下钻', render:drillOverlay},
  importw: {kind:'modal', title:'导入数据', render:importOverlay},
  rollback:{kind:'panel', title:'回滚点', render:rollbackOverlay},
  account: {kind:'panel', title:'账户', render:accountOverlay},
  catedit: {kind:'panel', title:'分类', render:catEditOverlay},
  moveto:  {kind:'modal', title:'移动到…', render:moveCatOverlay},
  /* 第八轮：配置中心弹窗 —— 报表工具栏「设置」与设置页「配置中心」打开同一批（多入口一份数据），
     形态对齐 apps/web ConfigModal：Tab + 树形列表（一行一个实体，列固定）+ 增删/排序/移动 */
  acctcfg: {kind:'panel', title:'账户分类管理', render:()=>acctCfgOverlay()},
  catcfg:  {kind:'panel', title:'收支分类设置', render:()=>catCfgOverlay()},
  /* 第十二轮：标题对齐真实实现（CashFlowConfigModal = 现金流量表设置） */
  cfcfg:   {kind:'panel', title:'现金流量表设置', render:()=>cfCfgOverlay()},
  movecf:  {kind:'modal', title:'移动到…', render:moveCfOverlay},
  moveacc: {kind:'modal', title:'移动到…', render:moveAccOverlay},
  /* 第十轮：setsec 标题 = 分区名本身（与四个配置弹窗标题平级）；
     渲染按当前设备 —— 移动端全屏页（设置页入口）/ 抽屉（报表 ⚙、流水「显示」）与 PC 面板同一渲染器 */
  setsec:  {kind:'panel', title:arg=>`${arg&&arg.sec?arg.sec:'列表显示'}`, render:arg=>settingsContent(arg.sec||'列表显示',S.device)},
  /* 第七轮：抽屉标题与 PC 面板同文 —— 时点「选择时点」/ 期间「选择期间」（两端同名） */
  period:  {kind:'panel', title:()=>isPointReport()?'选择时点':'选择期间', render:periodOverlay},
  filter:  {kind:'panel', title:'高级筛选', render:()=>filterPanelM()},
  invsnap: {kind:'panel', title:'配置快照', render:invSnapOverlay},
  invtarget:{kind:'panel', title:'投资资产类型配置', render:invTargetOverlay},
  oplog:   {kind:'panel', title:'操作记录', render:()=>opLogOverlay()},
  /* 评审轮 T2：批量删除二次确认层 —— 文案含「共 N 笔」，确认后 toast 可一次撤销全部 */
  batchdel:{kind:'modal', title:'删除确认', render:()=>batchDelConfirm()},
  /* 第九轮：现金流属性编辑浮层（行尾 ⋯ → 编辑）——第十一轮被多级菜单取代，已删 */
  /* 第十一轮：全部账户二级抽屉（记账内换账户）——固定高度 + 搜索 + 分组 + 内部滚动 */
  accpick:{kind:'modal', title:'选择账户', render:()=>accPickOverlay()},
};
S.overlay=null; S.ovArg=null; S.ovStack=[];

/* 第八轮：弹层栈语义 ——
   ‹ 返回 = 回到上一级弹窗（当前弹窗由另一弹窗打开时压栈）；✕ 关闭 = 关闭整条弹窗链。
   没有上一级（栈空）时隐藏返回按钮。同一浮层内部换模式（列表↔编辑）用 swapOverlay 不压栈。
   评审轮（载体分置拍板）：arg.page = 移动端全屏二级页变体 —— 设置页「配置中心」
   4 入口用它（占满机身、页头 ‹ 返回）；报表 ⚙ 设置仍走普通底部抽屉（边改边看）。
   swapOverlay 继承 page 标记：同一弹窗内部换模式不换载体。 */
function openOverlay(id,arg){
  if(S.overlay) S.ovStack.push({id:S.overlay,arg:S.ovArg});
  S.overlay=id; S.ovArg=arg||{};
  S.cfgMenu=null;
  renderOverlay();
}
function swapOverlay(id,arg){
  arg=arg||{};
  if(S.ovArg&&S.ovArg.page&&!arg.page) arg={...arg,page:true};
  S.overlay=id; S.ovArg=arg;
  S.cfgMenu=null;
  renderOverlay();
}
function backOverlay(){
  const prev=S.ovStack.pop();
  if(!prev){ closeOverlay(); return; }
  S.overlay=prev.id; S.ovArg=prev.arg||{};
  S.cfgMenu=null;
  renderOverlay();
}
function closeOverlay(){
  S.overlay=null; S.ovArg=null; S.ovStack=[];
  S.cfgMenu=null;
  S.budOne=null;
  S.budConfirm=null;
  renderOverlay();
}
function renderOverlay(){
  const pcSide=$('#sidePanel'), pcModal=$('#modal'), pcVeil=$('#veil');
  const mDrawer=$('#mDrawer'), mVeil=$('#mVeil');
  if(!S.overlay){
    pcSide.classList.remove('open'); pcModal.classList.remove('open'); pcVeil.classList.remove('open');
    mDrawer.classList.remove('open'); mDrawer.classList.remove('full'); mDrawer.classList.remove('above-entry'); mVeil.classList.remove('open');
    pcSide.innerHTML=''; pcModal.innerHTML=''; mDrawer.innerHTML='';
    return;
  }
  const def=OV[S.overlay];
  const body=def.render(S.ovArg);
  const ovTitle=typeof def.title==='function'?def.title(S.ovArg):def.title;
  /* 返回按钮仅在有上一级时出现；✕ 恒在（关整条链） */
  const backBtn=S.ovStack.length
    ? `<button class="icon-btn sp-back" onclick="backOverlay()" aria-label="返回">${I.back}</button>` : '';
  if(S.device==='m'){
    /* 移动端统一承载：底部抽屉，头部语义与 PC 相同（‹ 返回 / ✕ 关闭）。
       page 变体 = 全屏二级页：占满机身、页头只有 ‹ 返回（栈空时即退回上一页），
       不渲染 grabber 与 ✕（关闭整链由返回逐级完成）。
       第十一轮：记账抽屉之上再开选择层（accpick）时提层 —— m-sheet(entry) z:60 > m-drawer z:50，
       需 above-entry（z:70）才能盖住记账抽屉。 */
    const full=S.ovArg&&S.ovArg.page;
    mDrawer.innerHTML=`
      ${full?'':'<div class="grabber"></div>'}
      <div class="d-head">${full
        ? `<button class="m-back" onclick="backOverlay()" aria-label="返回">${I.back}</button><h3>${ovTitle}</h3>`
        : `${backBtn}<h3>${ovTitle}</h3><button class="icon-btn" onclick="closeOverlay()" aria-label="关闭">${I.x}</button>`}
      </div>
      <div class="d-body">${body}</div>`;
    mDrawer.classList.toggle('full',!!full);
    mDrawer.classList.toggle('above-entry',!!S.entryOpen);
    mDrawer.classList.add('open'); mVeil.classList.add('open');
    pcSide.classList.remove('open'); pcModal.classList.remove('open'); pcVeil.classList.remove('open');
  }else{
    if(def.kind==='modal'){
      pcModal.innerHTML=`
        <div class="mo-head">${backBtn}<h2>${ovTitle}</h2><button class="icon-btn" onclick="closeOverlay()" aria-label="关闭">${I.x}</button></div>
        <div class="mo-body">${body}</div>`;
      pcModal.classList.add('open'); pcSide.classList.remove('open');
    }else{
      pcSide.innerHTML=`
        <div class="sp-head">${backBtn}<h2>${ovTitle}</h2><button class="icon-btn" onclick="closeOverlay()" aria-label="关闭">${I.x}</button></div>
        <div class="sp-body">${body}</div>`;
      pcSide.classList.add('open'); pcModal.classList.remove('open');
    }
    pcVeil.classList.add('open');
    mDrawer.classList.remove('open'); mVeil.classList.remove('open');
  }
}

/* ================= W4 · 交易详情 / 编辑 ================= */
function openTx(id,mode){
  S.ovArg={id,mode};
  openOverlay('tx',S.ovArg);
}
function txOverlay(arg){
  const tx=TXNS.find(t=>t.id===arg.id);
  if(!tx) return `<div class="state-wrap"><h2>这笔已不存在</h2></div>`;
  if(arg.mode==='edit') return txEditForm(tx);
  const acc=ACC.find(a=>a.id===tx.acc);
  const rows=[
    ['日期',tx.date],['分类',catLabel(tx.type,tx.cat)],['账户',acc?.name||tx.acc],
    ['类型',TYPE_CN[tx.type]],['手续费',tx.fee?fmt(tx.fee):'—'],
    ['优惠券',tx.coupon?fmt(tx.coupon):'—'],['备注',tx.note||'—'],
  ];
  return `
    <div style="text-align:center;padding:8px 0 16px;border-bottom:1px solid var(--mb-line)">
      <div class="num" style="font-size:var(--mb-fs-6);font-weight:700">${tx.amt<0&&!txSign(tx)?'−':''}${txSign(tx)}${abs(tx.amt)}</div>
      <div style="margin-top:4px">${catLabel(tx.type,tx.cat)}${tx.note?' · '+tx.note:''}</div>
      <div class="lbl" style="margin-top:2px">${acc?.name||''} · ${tx.date}</div>
    </div>
    <div class="lv-list">${rows.map(([k,v])=>`<div class="lv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    <div class="entry-actions" style="border-top:1px solid var(--mb-line);margin-top:16px">
      <button class="btn ghost" onclick="delTx('${tx.id}')">删除</button>
      <button class="btn primary" onclick="openTx('${tx.id}','edit')">编辑</button>
    </div>`;
}
function txEditForm(tx){
  return `
    <div class="amt-input" style="margin-top:0"><span class="cur">¥</span>
      <input class="amt-f" id="txAmt" value="${tx.amt}" oninput="updateTx('${tx.id}','amt',this.value)"></div>
    <div class="field"><label>分类</label><select onchange="updateTx('${tx.id}','cat',this.value)">
      ${catOptions(tx.type).map(o=>`<option value="${o.v}" ${tx.cat===o.v?'selected':''}>${o.level?'　'+o.label:o.label}</option>`).join('')}</select></div>
    <div class="field"><label>账户</label><select onchange="updateTx('${tx.id}','acc',this.value)">
      ${ACC.map(a=>`<option value="${a.id}" ${tx.acc===a.id?'selected':''}>${a.name}</option>`).join('')}</select></div>
    <div class="field"><label>日期</label><input type="date" value="${tx.date}" onchange="updateTx('${tx.id}','date',this.value)"></div>
    <div class="field"><label>备注</label><input value="${tx.note||''}" oninput="updateTx('${tx.id}','note',this.value)"></div>
    <div class="entry-actions" style="padding-left:0;padding-right:0">
      <button class="btn primary" onclick="saveTxEdit('${tx.id}')">保存</button>
    </div>`;
}
/* 编辑态直接改草稿对象，提交时才写回 —— 取消即丢弃 */
function updateTx(id,field,val){
  const tx=TXNS.find(t=>t.id===id);
  if(!tx) return;
  S.txEdit=S.txEdit||{};
  S.txEdit[field]=val;
}
function saveTxEdit(id){
  const tx=TXNS.find(t=>t.id===id);
  const d=S.txEdit||{};
  if(tx){
    const before={amt:tx.amt,cat:tx.cat,acc:tx.acc,date:tx.date,note:tx.note};
    if(d.amt!=null&&d.amt!=='') tx.amt=parseFloat(d.amt);
    if(d.cat) tx.cat=d.cat;
    if(d.acc) tx.acc=d.acc;
    if(d.date) tx.date=d.date;
    if(d.note!=null) tx.note=d.note;
    S.txEdit=null;
    closeOverlay();
    render();
    toast('已保存修改','撤销',()=>{ Object.assign(tx,before); render(); });
    return;
  }
  S.txEdit=null;
  closeOverlay();
  render();
}

/* ================= W3 · 批量改分类 ================= */
function catPickOverlay(arg){
  const ids=arg.ids||[];
  return `
    <div class="hint" style="margin-bottom:12px">将 ${ids.length} 笔流水改为同一分类。只改分类，金额、账户、日期不变。</div>
    <div class="cat-pick">
      ${catOptions('expense').map(o=>`<button class="${o.level?'sub':''}" onclick="applyBatchCat('${o.v}')">${catGlyph(o.label)}<span class="nm">${o.level?'└ '+o.label:o.label}</span></button>`).join('')}
    </div>`;
}
/* ================= 第十一轮 · 全部账户二级抽屉（记账内换账户） =================
   固定高度（max-height 60vh）+ 搜索框 + 按账户分类分组 + 列表内部滚动；
   从记账 chips 的「全部账户 ›」打开，选完回原抽屉 —— 外层高度不变。 */
function accPickOverlay(){
  const q=(S.accPickQ||'').trim().toLowerCase();
  const hit=a=>!q||a.name.toLowerCase().includes(q)||accCatName(a.cat).includes(q);
  const groups=ACC_CATS.map(c=>{
    const list=ACC.filter(a=>a.cat===c.id&&hit(a));
    if(!list.length) return '';
    return `<div class="set-sec">${c.name} · ${list.length} 个</div>
      ${list.map(a=>`<button class="set-item set-link acc-pick-row" onclick="accPickChoose('${a.id}')">
        <span class="acct-ico">${glyph(a.name)}</span>
        <span class="meta"><span class="t">${a.name}</span><span class="s">余额 ¥${fmt(a.bal)} · ${accKind(a)}</span></span>
        <span class="set-chev">${I.chev}</span></button>`).join('')}`;
  }).join('');
  return `
    <div class="search" style="margin-bottom:8px">${I.search}<input placeholder="搜索账户 / 分类…" value="${S.accPickQ||''}" oninput="accPickInput(this.value)"></div>
    <div class="acc-pick-list">${groups||`<div class="state-wrap"><h2>没有匹配的账户</h2><p>换个关键词，或清空搜索。</p></div>`}</div>`;
}
function applyBatchCat(cat){
  const ids=Array.from(S.sel);
  const before=TXNS.filter(t=>ids.includes(t.id)).map(t=>({id:t.id,cat:t.cat}));
  TXNS.forEach(t=>{ if(ids.includes(t.id)) t.cat=cat; });
  S.sel.clear(); S.batch=false;
  closeOverlay();
  render();
  toast(`已把 ${before.length} 笔改为「${catName('expense',cat)}」`,'撤销',
    ()=>{ before.forEach(b=>{ const t=TXNS.find(x=>x.id===b.id); if(t) t.cat=b.cat; }); render(); });
}

/* ================= W7 · 预算条目与超支处理 ================= */
/* M4：预算条目按 id 定位（不再按分类），条目 = 名称 + 类型 + 金额 + 周期 + 分类 + 账户 */
function openBudget(id){ openOverlay('budget',{id}); }
/* 第十七轮：统一「调整所有预算条目」入口移除 —— 金额调整只在单一预算条目详情内做。
   理由：全局调整表把「改哪一条」和「改多少」拆成两步，且三类预算（支出/收入/转账）
   的语义差异在批量表里看不出来；条目内调整能就地给出该类条的用量/超支反馈。 */
function budFeedbackText(b){
  const diff=b.amount-b.used;
  if(diff===0) return b.type==='income'?'已达成目标':'额度刚好用完';
  if(b.type==='expense') return b.over?`已超支 ¥${fmt(-diff)}`:`未超支，剩余 ¥${fmt(diff)}`;
  if(b.type==='income') return b.over?`已达成目标（超出 ¥${fmt(-diff)}）`:`距目标还差 ¥${fmt(diff)}`;
  return b.over?`流转量超出监控阈值 ¥${fmt(-diff)}`:`阈值内，剩余 ¥${fmt(diff)}`;
}
function budgetOverlay(arg){
  if(arg.mode==='new') return budgetNewForm();
  const b=budgetRows().find(x=>x.id===arg.id);
  if(!b) return `<div class="state-wrap"><h2>没有该预算条目</h2></div>`;
  const over=b.type==='expense'&&b.over;
  const [from,to]=budgetRange(b,NOW_T());
  const draft=S.budOne&&S.budOne.id===b.id?S.budOne.v:b.amount;
  return `
    <div class="drill-head"><span>${b.name}</span><span class="amt num">${fmt(b.used)} / ${fmt(b.amount)}</span></div>
    <div class="track" style="margin:12px 0"><div class="fill" style="width:${Math.min(100,b.pct)}%"></div></div>
    <div class="lv-list">
      <div class="lv"><span class="k">类型</span><span class="v">${BUDGET_TYPE_CN[b.type]}</span></div>
      <div class="lv"><span class="k">周期</span><span class="v">${budgetPeriodName(b.period)}</span></div>
      <div class="lv"><span class="k">分类</span><span class="v">${catLabel(b.type,b.cat)}</span></div>
      <div class="lv"><span class="k">账户</span><span class="v">${b.acc?accName(b.acc):'不限'}</span></div>
      <div class="lv"><span class="k">统计区间</span><span class="v">${from} ~ ${to}</span></div>
    </div>
    ${over?`
    <div class="bud-over">
      <span class="lab">已超支 ¥${fmt(b.used-b.amount)}，怎么处理？</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" onclick="budFix('${b.id}','actual')">按实际调整金额（→ ¥${fmt(b.used)}）</button>
      <button class="btn" onclick="budFix('${b.id}','keep')">维持金额 ¥${fmt(b.amount)}</button>
      <button class="btn ghost" onclick="gotoCat('${b.cat}')">查看该分类流水</button>
    </div>`:''}
    <div class="d-sec">调整该条目额度</div>
    <div class="field"><label>预算金额</label>
      <div class="bud-amt-row">
        <input value="${draft}" inputmode="decimal" aria-label="该条目的预算金额"
          oninput="S.budOne={id:'${b.id}',v:this.value}">
        <button class="btn bud-save" onclick="saveBudgetOne('${b.id}')">保存</button>
      </div>
    </div>
    <div class="hint">${budFeedbackText(b)}</div>
    <div class="d-sec">该分类流水</div>
    ${TXNS.filter(t=>t.type===b.type&&catHit(t.cat,b.cat)).map(t=>`<div class="drill-list"><div class="row"><span>${catName(t.type,t.cat)}${t.note?' · '+t.note:''}</span><span class="v">${t.type==='income'||t.type==='refund'?'+':'−'}${fmt(t.amt)}</span></div></div>`).join('')}
    <div style="margin-top:12px">
      <button class="btn ghost" onclick="delBudget('${b.id}')" title="删除该预算条目（两步确认）">${S.budConfirm===b.id?'再点一次确认删除':'删除条目'}</button>
    </div>`;
}
/* 预算条目删除（第十六轮补齐）：详情面板两步确认 + toast 撤销——
   原先「删除」双端都没有（新增有、金额调整有，唯独没有删除），补齐后双端同入口（详情面板） */
function delBudget(id){
  if(S.budConfirm!==id){ S.budConfirm=id; renderOverlay(); return; }
  const i=BUDGETS.findIndex(b=>b.id===id);
  if(i<0) return;
  const [rm]=BUDGETS.splice(i,1);
  S.budConfirm=null;
  closeOverlay();
  toast(`已删除预算条目「${rm.name}」`,'撤销',()=>{ BUDGETS.splice(i,0,rm); render(); });
}
/* 第十七轮：条目内调整额度 —— 保存后详情面板保持打开，用量/超支反馈随新额度即时重算 */
function saveBudgetOne(id){
  const b=BUDGETS.find(x=>x.id===id);
  if(!b) return;
  const raw=S.budOne&&S.budOne.id===id?S.budOne.v:'';
  const v=parseFloat(raw);
  if(!v||v<=0){ toast('先填预算金额','提示'); return; }
  const before=b.amount;
  b.amount=v;
  S.budOne=null;
  render();
  renderOverlay();
  toast(`「${b.name}」额度已调整为 ¥${fmt(v)}`,'撤销',()=>{ b.amount=before; render(); renderOverlay(); });
}
/* 新增预算条目：名称 + 类型 + 金额 + 周期 + 分类 + 账户 */
function budgetNewForm(){
  const d=S.budDraft||{};
  const type=d.type||'expense';
  return `
    <div class="field"><label>名称</label><input value="${d.name||''}" placeholder="如：餐饮" oninput="S.budDraft={...S.budDraft,name:this.value}"></div>
    <div class="field"><label>类型</label><select onchange="S.budDraft={...S.budDraft,type:this.value};renderOverlay()">
      ${['expense','income','transfer'].map(t=>`<option value="${t}" ${type===t?'selected':''}>${BUDGET_TYPE_CN[t]}</option>`).join('')}</select></div>
    <div class="field"><label>金额</label><input value="${d.amount||''}" inputmode="decimal" oninput="S.budDraft={...S.budDraft,amount:this.value}"></div>
    <div class="field"><label>周期</label><select onchange="S.budDraft={...S.budDraft,period:this.value}">
      ${BUDGET_PERIODS.map(([v,l])=>`<option value="${v}" ${(d.period||'monthly')===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>分类</label><select onchange="S.budDraft={...S.budDraft,cat:this.value}">
      ${catOptions(type).map(o=>`<option value="${o.v}" ${d.cat===o.v?'selected':''}>${o.level?'　'+o.label:o.label}</option>`).join('')}</select></div>
    <div class="field"><label>账户（可选）</label><select onchange="S.budDraft={...S.budDraft,acc:this.value}">
      <option value="">不限</option>
      ${ACC.map(a=>`<option value="${a.id}" ${d.acc===a.id?'selected':''}>${a.name}</option>`).join('')}</select></div>
    <div class="hint">用量按该条目的周期区间与所选分类子树统计；不选账户则统计全部账户。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="closeOverlay()">取消</button>
      <button class="btn primary" onclick="saveBudgetNew()">新增</button>
    </div>`;
}
function saveBudgetNew(){
  const d=S.budDraft||{};
  if(!d.name){ toast('先填预算条目名称','提示'); return; }
  const amount=parseFloat(d.amount);
  if(!amount||amount<=0){ toast('先填预算金额','提示'); return; }
  BUDGETS.push({id:'b'+Date.now(),name:d.name,type:d.type||'expense',period:d.period||'monthly',
    amount,cat:d.cat||null,acc:d.acc||null});
  const nb=BUDGETS[BUDGETS.length-1];
  S.budDraft=null;
  closeOverlay();
  render();
  toast('已新增预算条目','撤销',()=>{ const i=BUDGETS.indexOf(nb); if(i>=0) BUDGETS.splice(i,1); render(); });
}
function budFix(id,how){
  const b=BUDGETS.find(x=>x.id===id);
  if(!b) return;
  const used=budgetUsed(b);
  const before=b.amount;
  if(how==='actual') b.amount=Math.ceil(used);
  closeOverlay();
  render();
  toast(how==='actual'?`「${b.name}」金额已调整为 ¥${fmt(b.amount)}`:'已维持原金额，超支保留在流水中','撤销',
    ()=>{ b.amount=before; render(); });
}
function gotoCat(cat){
  closeOverlay();
  S.filters.cat=cat; S.typeFilter=undefined;
  go('txns');
}

/* ================= W6 · 报表下钻 ================= */
function openDrill(cat,type){ openOverlay('drill',{cat,type}); }
function drillOverlay(arg){
  const t=arg.type||'expense';
  /* 下钻父分类时含其子分类（与报表的父行口径一致） */
  const rows=TXNS.filter(x=>x.type===t&&catHit(x.cat,arg.cat));
  const total=rows.reduce((s,x)=>s+x.amt,0);
  return `
    <div class="drill-head"><span>${catLabel(t,arg.cat)} · ${rows.length} 笔</span><span class="amt num">${fmt(total)}</span></div>
    <div class="drill-sec">按日</div>
    <div class="drill-list">${rows.map(x=>`
      <div class="row"><span>${x.date} · ${x.note||'—'}<br><span class="lbl">${accName(x.acc)}</span></span><span class="v">${t==='income'?'+':'−'}${fmt(x.amt)}</span></div>`).join('')}</div>
    <div class="d-sec">按账户</div>
    <div class="lv-list">${Object.entries(rows.reduce((m,x)=>{ m[x.acc]=(m[x.acc]||0)+x.amt; return m; },{})).map(([a,v])=>
      `<div class="lv"><span class="k">${accName(a)}</span><span class="v">${fmt(v)}</span></div>`).join('')}</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:16px">
      <button class="btn primary" onclick="gotoCat('${arg.cat}')">在流水中查看</button>
    </div>`;
}

/* ================= W5 · 账户 / 分类配置 ================= */
/* M9：账户挂在「账户分类」下；现金等价 / 投资账户是分类上的标记，不是账户属性 */
function openOverlayAccount(id){ openOverlay('account',{id}); }
function accountOverlay(arg){
  /* 第十三轮：支持「新增账户」从分类行 ⋯ 进入（预选归属分类） */
  const a=arg.id?ACC.find(x=>x.id===arg.id):null;
  const d=S.accDraft||{};
  const cur=d.name!==undefined?d.name:(a?a.name:'');
  const curCat=d.cat!==undefined?d.cat:(a?a.cat:(arg.cat||'deposit'));
  const curBal=d.bal!==undefined?d.bal:(a?a.bal:'');
  const c=accCat(curCat);
  return `
    <div class="field"><label>账户名称</label><input value="${cur}" placeholder="如：招商储蓄卡" oninput="S.accDraft={...S.accDraft,name:this.value}"></div>
    <div class="field"><label>账户分类</label><select onchange="S.accDraft={...S.accDraft,cat:this.value};renderOverlay()">
      ${ACC_CATS.map(x=>`<option value="${x.id}" ${curCat===x.id?'selected':''}>${x.name}（${x.type==='asset'?'资产':'负债'}）</option>`).join('')}</select></div>
    <div class="field"><label>初始余额</label><input value="${curBal}" oninput="S.accDraft={...S.accDraft,bal:this.value}"></div>
    <div class="hint">该分类的标记：${c.cashEq?'现金等价':c.inv?'投资账户':'无'}。标记决定报表口径（流动资产 / 投资分析），改标记请到「账户分类配置」。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="backOverlay()">取消</button>
      <button class="btn primary" onclick="saveAccount('${arg.id||''}')">保存</button>
    </div>`;
}
function saveAccount(id){
  const d=S.accDraft||{};
  if(!d.name){ toast('先填账户名称','提示'); return; }
  if(id){
    const a=ACC.find(x=>x.id===id);
    if(a){
      const before={name:a.name,cat:a.cat};
      a.name=d.name; if(d.cat) a.cat=d.cat;
      S.accDraft=null;
      backOverlay(); render();
      toast('账户已更新','撤销',()=>{ Object.assign(a,before); render(); });
      return;
    }
  }
  ACC.push({id:'a'+Date.now(),name:d.name,cat:d.cat||'deposit',bal:parseFloat(d.bal||0)});
  const na=ACC[ACC.length-1];
  S.accDraft=null;
  backOverlay(); render();
  toast('账户已新增','撤销',()=>{ const i=ACC.indexOf(na); if(i>=0) ACC.splice(i,1); render(); });
}
/* S7：现金流属性 = 经营 / 投资 / 筹资 / 未分类（对齐真实 cashFlowType）。
   分类维护对齐真实实现：排序（评审轮 T5：↑↓ 已删，只留 ⠿ 拖拽占位）、移动（改上级分类）、
   重命名、删除（交易必须转移到其他分类，不允许多选「连子级一起删」）。
   行内操作收敛：编辑 / 移动到… / 删除收进行尾「⋯」菜单（toggleCfgMenu，一次只开一个）。 */
function toggleCfgMenu(key){
  S.cfgMenu=S.cfgMenu===key?null:key;
  render();   /* 平铺 section 与浮层两种宿主都要重绘（第十一轮 PC 平铺后不能只 renderOverlay） */
}
/* 第十三轮：账户分类管理的 Tab（资产 / 负债，对齐真实 AccountConfigModal） */
function setAccTab(t){ S.accTab=t; S.cfgMenu=null; render(); }
/* 第十三轮：删除账户分类（保护：分类下有账户不可删——对齐真实实现的级联保护语义，线框取「禁删 + 说明」） */
function delAccCat(id){
  const i=ACC_CATS.findIndex(c=>c.id===id);
  if(i<0) return;
  if(ACC.some(a=>a.cat===id)){ toast('分类下有账户，无法删除','提示'); return; }
  const [rm]=ACC_CATS.splice(i,1);
  S.cfgMenu=null;
  render();
  toast(`已删除分类「${rm.name}」`,'撤销',()=>{ ACC_CATS.splice(i,0,rm); render(); });
}
/* 第七轮：「移动到…」浮层 —— 树形列表行内改父级。
   规则（对齐真实实现 MoveModal）：父只能是一级分类、不能是自己；
   选中「作为一级分类」即提升为一级。 */
function moveCatOverlay(arg){
  const type=arg.type;
  const arr=CATS[type]||[];
  const cur=arr.find(c=>c[0]===arg.id);
  if(!cur) return `<div class="hint">分类不存在</div>`;
  const parents=arr.filter(c=>!c[2]&&c[0]!==arg.id);
  const sel=S.moveToTarget!==undefined?S.moveToTarget:(cur[2]||'');
  return `
    <div class="hint" style="margin-bottom:12px">把「${cur[1]}」移动到哪个一级分类下？选「作为一级分类」则提升为一级。</div>
    <div class="lv-list">
      <label class="lv" style="align-items:center;cursor:pointer">
        <span class="k">（作为一级分类）</span>
        <input type="radio" name="moveto" ${sel===''?'checked':''} onchange="S.moveToTarget=''">
      </label>
      ${parents.map(p=>`<label class="lv" style="align-items:center;cursor:pointer">
        <span class="k">${p[1]}</span>
        <input type="radio" name="moveto" ${sel===p[0]?'checked':''} onchange="S.moveToTarget='${p[0]}'">
      </label>`).join('')}
    </div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="backOverlay()">取消</button>
      <button class="btn primary" onclick="applyMoveCat('${type}','${arg.id}')">移动</button>
    </div>`;
}
function applyMoveCat(type,id){
  const arr=CATS[type]||[];
  const cur=arr.find(c=>c[0]===id);
  if(!cur) return;
  const target=S.moveToTarget!==undefined?S.moveToTarget:(cur[2]||'');
  if(target===id){ toast('不能移动到自己下面','提示'); return; }
  const oldParent=cur[2]||null;
  cur[2]=target||undefined;
  S.moveToTarget=undefined;
  backOverlay(); render();
  toast(`已移动到${target?catName(type,target)+' 下':'一级分类'}`,'撤销',
    ()=>{ cur[2]=oldParent||undefined; render(); });
}
/* ================= 收支分类设置（第十三轮：对齐真实 TransactionConfigModal.tsx） =================
   真实实现：标题「收支分类设置」+ 3 Tab（收入 / 支出 / 转账）；每 Tab = 两级树
   （一级分类行可折叠展开子分类，展开图标在最左）；行操作 ⋯ 菜单 =
   一级行 [新增子分类 / 编辑 / 移动到… / 删除]、二级行 [编辑 / 移动到… / 删除]；
   移动 = MoveModal（radio 树、当前位禁选、显示当前位置；目标 = 一级分类或「作为一级」）；
   删除保护 = 有子分类直接拒绝；有交易 → 删除确认弹窗（转移 / 连删二选一）；
   排序 = dnd 拖拽（同层级内，跨层拒绝）；Tab 栏右侧「＋」新增一级分类。
   原型不造的（真实实现没有 / 数据不支撑）：图标颜色选择（线框灰阶）、
   删除「连删交易」分支（线框只演示转移路径，保交易不丢）。 */
function catCfgOverlay(){
  const type=S.catTab||'income';
  const typeTabs=`<div class="seg-row" style="margin-bottom:8px">${[['income','收入分类'],['expense','支出分类'],['transfer','转账分类']]
    .map(([k,l])=>`<button class="${type===k?'on':''}" onclick="setCatTab('${k}')">${l}</button>`).join('')}
    <button class="btn btn-sm primary" style="margin-left:auto" onclick="openOverlay('catedit',{type:'${type}',mode:'new'})" aria-label="新增一级分类">＋</button></div>`;
  const arr=CATS[type]||[];
  const empty=`<div class="state-wrap"><h2>暂无${{expense:'支出',income:'收入',transfer:'转账'}[type]}分类</h2><p>点右上「＋」建立第一个分类。</p></div>`;
  /* 递归行渲染（第十三轮）：任意节点有子项即可折叠；缩进按深度（移动产生三级链时仍完整可见） */
  const renderRow=(c,depth)=>{
    const kids=arr.filter(x=>x[2]===c[0]);
    const isTop=!c[2];
    const txN=isTop
      ? TXNS.filter(t=>catSubtree(type,c[0]).includes(t.cat)&&catType(t.type)===type).length
      : TXNS.filter(t=>t.cat===c[0]).length;
    const key=`cat:${type}:${c[0]}`;
    const foldKey=`catcfg:${type}:${c[0]}`;
    const menu=S.cfgMenu===key?`<span class="row-menu">
      ${isTop?`<button class="row-mi" onclick="openOverlay('catedit',{type:'${type}',mode:'new',parent:'${c[0]}'})">新增子分类</button>`:''}
      <button class="row-mi" onclick="openOverlay('catedit',{id:'${c[0]}',type:'${type}'})">编辑</button>
      <button class="row-mi" onclick="openOverlay('moveto',{id:'${c[0]}',type:'${type}'})">移动到…</button>
      <button class="row-mi" ${kids.length?'disabled':''} title="${kids.length?'有子分类，无法删除':''}" onclick="delCatInline('${type}','${c[0]}')">删除</button>
    </span>`:'';
    const head=`<div class="set-item" ${depth?`style="padding-left:${depth*18}px"`:''}>
      ${kids.length?`<button class="fold ${S.folded.has(foldKey)?'closed':''}" onclick="toggleFold('${foldKey}')" aria-expanded="${!S.folded.has(foldKey)}" aria-label="${S.folded.has(foldKey)?'展开':'折叠'}子分类">${S.folded.has(foldKey)?I.foldRight:I.foldDown}</button>`:''}
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="cat-ico">${catGlyph(c[1])}</span>
      <span class="meta"><span class="t">${c[1]}</span><span class="s">${txN} 笔交易${kids.length?` · ${kids.length} 个子分类`:''}</span></span>
      <span class="row-more-wrap">
        <button class="btn btn-sm" onclick="toggleCfgMenu('${key}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===key}">⋯</button>
        ${menu}
      </span>
    </div>`;
    const kidRows=S.folded.has(foldKey)?'':kids.map(k=>renderRow(k,depth+1)).join('');
    return head+kidRows;
  };
  const rows=arr.filter(c=>!c[2]).map(c=>renderRow(c,0)).join('');
  return `${typeTabs}${rows||empty}
  <div class="tbl-note">移动 = 改上级分类（子树整体跟随，层级可加深）；删除有子分类的分类会被拒绝；有交易的分类删除时转移交易。</div>`;
}
/* ================= 账户分类管理（第十三轮：对齐真实 AccountConfigModal.tsx） =================
   真实实现：标题「账户分类管理」+ 2 Tab（资产分类 / 负债分类）；每 Tab = 两级树
   （分类行可折叠展开账户，展开图标最左）；行操作 ⋯ 菜单 =
   分类行 [新增账户 / 编辑 / 删除]、账户行 [编辑 / 移动到… / 删除]；
   移动 = MoveModal（radio、当前分类禁选、显示当前位置，目标 = 同类型分类）；
   删除保护 = 账户删除走确认弹窗（有交易时列明 N 条并将级联删除）；
   排序 = dnd 拖拽（分类同级拖 / 账户同分类内拖，跨类拒绝）；Tab 栏右侧「＋」新增分类。
   原型不造的：级联强删（线框保留「有引用禁删」保护，与真实 force 删除不同的取舍见 §8.19）。
   第十一轮职责划分不变：现金等价 / 投资标记在现金流量表设置管。 */
function acctCfgOverlay(){
  const type=S.accTab||'asset';
  const typeTabs=`<div class="seg-row" style="margin-bottom:8px">${[['asset','资产分类'],['liability','负债分类']]
    .map(([k,l])=>`<button class="${type===k?'on':''}" onclick="setAccTab('${k}')">${l}</button>`).join('')}
    <button class="btn btn-sm primary" style="margin-left:auto" onclick="openOverlay('catedit',{type:'${type}',mode:'new'})" aria-label="新增分类">＋</button></div>`;
  const cats=ACC_CATS.filter(c=>c.type===type);
  const empty=`<div class="state-wrap"><h2>暂无${type==='asset'?'资产':'负债'}分类</h2><p>点右上「＋」建立第一个分类。</p></div>`;
  const rows=cats.map(c=>{
    const list=ACC.filter(a=>a.cat===c.id);
    const key=`acccat:${c.id}`;
    const foldKey=`acccfg:${c.id}`;
    const menu=S.cfgMenu===key?`<span class="row-menu">
      <button class="row-mi" onclick="openOverlay('account',{mode:'new',cat:'${c.id}'})">新增账户</button>
      <button class="row-mi" onclick="openOverlay('catedit',{id:'${c.id}',kind:'acccat'})">编辑</button>
      <button class="row-mi" ${list.length?'disabled':''} title="${list.length?'分类下有账户，无法删除':''}" onclick="delAccCat('${c.id}')">删除</button>
    </span>`:'';
    const head=`<div class="set-item">
      <button class="fold ${S.folded.has(foldKey)?'closed':''}" onclick="toggleFold('${foldKey}')" aria-expanded="${!S.folded.has(foldKey)}" aria-label="${S.folded.has(foldKey)?'展开':'折叠'}账户">${S.folded.has(foldKey)?I.foldRight:I.foldDown}</button>
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="acct-ico">${glyph(c.name)}</span>
      <span class="meta"><span class="t">${c.name}</span><span class="s">${list.length} 个账户</span></span>
      <span class="row-more-wrap">
        <button class="btn btn-sm" onclick="toggleCfgMenu('${key}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===key}">⋯</button>
        ${menu}
      </span>
    </div>`;
    const accRows=S.folded.has(foldKey)?'':list.map(a=>{
      const confirming=S.accConfirm===a.id;
      const refN=TXNS.filter(t=>t.acc===a.id||t.toAcc===a.id).length;
      const aKey=`acc:${a.id}`;
      const aMenu=S.cfgMenu===aKey?`<span class="row-menu">
        <button class="row-mi" onclick="openOverlay('account',{id:'${a.id}'})">编辑</button>
        <button class="row-mi" onclick="openOverlay('moveacc',{id:'${a.id}'})">移动到…</button>
        <button class="row-mi" ${refN?'disabled':''} title="${refN?`有 ${refN} 笔交易引用，删除前先处理这些交易`:confirming?'再点一次确认删除':'账户删除需二次确认'}" ${confirming?'warn':''} onclick="delAcc('${a.id}')">${confirming?'确认删除':'删除'}</button>
      </span>`:'';
      return `<div class="set-item set-item-sub">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="acct-ico">${glyph(a.name)}</span>
        <span class="meta"><span class="t">${a.name}</span><span class="s">余额 ¥${fmt(a.bal)}${refN?` · ${refN} 笔交易`:''}</span></span>
        <span class="row-more-wrap">
          <button class="btn btn-sm" onclick="toggleCfgMenu('${aKey}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===aKey}">⋯</button>
          ${aMenu}
        </span>
      </div>`;}).join('');
    return head+accRows;
  }).join('');
  return `${typeTabs}${rows||empty}
  <div class="tbl-note">移动账户 = 改归属分类（MoveModal 当前位禁选）；分类下有账户时不可删除。现金等价 / 投资标记在「现金流分类」里改。</div>`;
}
/* 账户「移动到…」：radio 选目标账户分类（对齐真实 MoveModal：当前位禁选 + 显示当前位置 + 同类型过滤） */
function moveAccOverlay(arg){
  const acc=ACC.find(a=>a.id===arg.id);
  if(!acc) return `<div class="hint">账户不存在</div>`;
  const curCat=accCat(acc.cat);
  const sel=S.moveToTarget!==undefined?S.moveToTarget:acc.cat;
  const targets=ACC_CATS.filter(c=>c.type===curCat.type);
  return `
    <div class="hint" style="margin-bottom:12px">把「${acc.name}」移动到哪个账户分类下？当前位置：${curCat.name}。</div>
    <div class="lv-list">
      ${targets.map(c=>`<label class="lv" style="align-items:center;cursor:pointer;${c.id===acc.cat?'opacity:.45':''}">
        <span class="k">${c.name}${c.id===acc.cat?'（当前）':''}</span>
        <input type="radio" name="moveacc" ${sel===c.id?'checked':''} ${c.id===acc.cat?'disabled':''} onchange="S.moveToTarget='${c.id}'">
      </label>`).join('')}
    </div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="backOverlay()">取消</button>
      <button class="btn primary" onclick="applyMoveAcc('${arg.id}')">移动</button>
    </div>`;
}
function applyMoveAcc(id){
  const acc=ACC.find(a=>a.id===id);
  if(!acc) return;
  const target=S.moveToTarget!==undefined?S.moveToTarget:acc.cat;
  if(target===acc.cat){ S.moveToTarget=undefined; backOverlay(); return; }
  const old=acc.cat;
  acc.cat=target;
  S.moveToTarget=undefined;
  backOverlay(); render();
  toast(`已移动到「${accCatName(target)}」`,'撤销',()=>{ acc.cat=old; render(); });
}
/* ================= 现金流量表设置（第十二轮：对齐真实 CashFlowConfigModal.tsx） =================
   真实实现的结构（以此为据，替代第十一轮的「活动分组混排」形态）：
   · 标题「现金流量表设置」+ 4 个 Tab：资产分类 / 收入分类 / 支出分类 / 转账分类；
   · 资产分类 Tab：**资产类**账户分类按标记分三组 —— 现金及等价物（isCashEquivalent）/
     投资资产（isInvestment）/ 其他资产（两者皆否；负债分类不进此表）；
     行操作只有「移动到…」—— 移动即改标记组合（现金=只开 isCash、投资=只开 isInv、其他=双关），
     没有行内标记开关（标记由分组本身表达）；
   · 收入 / 支出 / 转账 Tab：各自的**一级**交易分类按 cashFlowType 分四组 ——
     经营活动 / 投资活动 / 筹资活动 / 未分配；行操作只有「移动到…」（改 cashFlowType，
     子分类随父更新）；二级分类无操作（随父）；
   · 组行可折叠、组头带「(N 个分类)」摘要；无搜索 / 无排序 / 无删除（本表只管归属）；空组不显示。
   取舍：保留 ⠿ 拖拽占位以维持五类配置行的统一模板（真实实现此表无排序，线框不单独破例）。 */
const CF_ASSET_GROUPS=[['cash','现金及等价物'],['investment','投资资产'],['other','其他资产']];
const CF_ACTIVITY_GROUPS=[['经营','经营活动'],['投资','投资活动'],['筹资','筹资活动'],['未分类','未分配']];
function accCatAssetGroup(c){ return c.cashEq?'cash':c.inv?'investment':'other'; }
function setCfTab(t){ S.cfTab=t; S.cfgMenu=null; render(); }
function cfCfgOverlay(){
  const tab=S.cfTab||'asset';
  const tabs=`<div class="seg-row" style="margin-bottom:8px">${[['asset','资产分类'],['income','收入分类'],['expense','支出分类'],['transfer','转账分类']]
    .map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="setCfTab('${k}')">${l}</button>`).join('')}</div>`;
  /* 组头（固定一级类别，第十六轮样式统一）：与资产类别设置的一级行同一模板
     （fold + ⠿ + 图标 + meta），唯一差别 = 无行尾 ⋯（固定类别不可改名/移动/删除）；
     折叠走 fold 按钮、摘要进 meta.s，交互不缺失 */
  const grp=(key,label,count,body)=>`<div class="set-item">
      <button class="fold ${S.folded.has(key)?'closed':''}" onclick="toggleFold('${key}')" aria-expanded="${!S.folded.has(key)}" aria-label="${S.folded.has(key)?'展开':'折叠'}">${S.folded.has(key)?I.foldRight:I.foldDown}</button>
      <span class="drag-handle" title="固定分组，不可排序">⠿</span>
      <span class="acct-ico">${glyph(label)}</span>
      <span class="meta"><span class="t">${label}</span><span class="s">${count} 个分类</span></span>
    </div>${S.folded.has(key)?'':body}`;
  if(tab==='asset'){
    const parts=CF_ASSET_GROUPS.map(([g,gl])=>{
      const list=ACC_CATS.filter(c=>c.type==='asset'&&accCatAssetGroup(c)===g);
      if(!list.length) return '';
      const body=list.map(c=>{
        const n=ACC.filter(a=>a.cat===c.id).length;
        const key=`cfa:${c.id}`;
        const menu=S.cfgMenu===key?`<span class="row-menu">
          <button class="row-mi" onclick="openOverlay('movecf',{kind:'asset',id:'${c.id}'})">移动到…</button>
        </span>`:'';
        return `<div class="set-item set-item-sub">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="acct-ico">${glyph(c.name)}</span>
        <span class="meta"><span class="t">${c.name}</span><span class="s">账户分类 · ${n} 个账户</span></span>
        <span class="row-more-wrap">
          <button class="btn btn-sm" onclick="toggleCfgMenu('${key}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===key}">⋯</button>
          ${menu}
        </span>
      </div>`;}).join('');
      return grp(`cfasset:${g}`,gl,list.length,body);
    }).join('');
    return `${tabs}${parts||`<div class="state-wrap"><h2>暂无资产分类</h2><p>账户分类在「账户分类」里维护。</p></div>`}
    <div class="tbl-note">现金及等价物 / 投资资产 / 其他资产由「现金等价 / 投资账户」标记决定——移动即改标记；负债分类不进现金流量表。标记只在此处改。</div>`;
  }
  /* 收入 / 支出 / 转账：一级交易分类按现金流活动分组 */
  const parts=CF_ACTIVITY_GROUPS.map(([g,gl])=>{
    const list=(CATS[tab]||[]).filter(c=>!c[2]&&cfOf(c[0])===g);
    if(!list.length) return '';
    const body=list.map(c=>{
      const txN=TXNS.filter(t=>catSubtree(tab,c[0]).includes(t.cat)&&catType(t.type)===tab).length;
      const kids=(CATS[tab]||[]).filter(x=>x[2]===c[0]).length;
      const key=`cfc:${c[0]}`;
      const menu=S.cfgMenu===key?`<span class="row-menu">
        <button class="row-mi" onclick="openOverlay('movecf',{kind:'cat',id:'${c[0]}',type:'${tab}'})">移动到…</button>
      </span>`:'';
      return `<div class="set-item set-item-sub">
      <span class="drag-handle" title="拖动排序">⠿</span>
      <span class="cat-ico">${catGlyph(c[1])}</span>
      <span class="meta"><span class="t">${c[1]}</span><span class="s">${txN} 笔交易${kids?` · ${kids} 个子分类`:''}</span></span>
      <span class="row-more-wrap">
        <button class="btn btn-sm" onclick="toggleCfgMenu('${key}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===key}">⋯</button>
        ${menu}
      </span>
    </div>`;}).join('');
    return grp(`cfact:${tab}:${g}`,gl,list.length,body);
  }).join('');
  return `${tabs}${parts||`<div class="state-wrap"><h2>暂无${{income:'收入',expense:'支出',transfer:'转账'}[tab]}分类</h2><p>分类在「收支分类」里维护。</p></div>`}
  <div class="tbl-note">移动到其它活动即改现金流归属（子分类随父更新，可撤销）；「未分配」不计入三类净额。分类的名称 / 层级 / 删除在「收支分类」里做。</div>`;
}
/* 「移动到…」浮层（对齐真实 MoveModal）：radio 选目标分组、当前位置禁选、显示当前位置 */
function moveCfOverlay(arg){
  const isAsset=arg.kind==='asset';
  const groups=isAsset?CF_ASSET_GROUPS:CF_ACTIVITY_GROUPS;
  const cur=isAsset
    ? accCatAssetGroup(ACC_CATS.find(c=>c.id===arg.id)||{})
    : cfOf(arg.id);
  const curLabel=(groups.find(([k])=>k===cur)||[,cur])[1];
  const name=isAsset
    ? (ACC_CATS.find(c=>c.id===arg.id)||{}).name
    : catName(arg.type,arg.id);
  const sel=S.moveToTarget!==undefined?S.moveToTarget:cur;
  return `
    <div class="hint" style="margin-bottom:12px">把「${name}」移动到哪个分组？当前位置：${curLabel}。子分类（若有）将一并更新。</div>
    <div class="lv-list">
      ${groups.map(([k,l])=>`<label class="lv" style="align-items:center;cursor:pointer;${k===cur?'opacity:.45':''}">
        <span class="k">${l}${k===cur?'（当前）':''}</span>
        <input type="radio" name="movecf" ${sel===k?'checked':''} ${k===cur?'disabled':''} onchange="S.moveToTarget='${k}'">
      </label>`).join('')}
    </div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="backOverlay()">取消</button>
      <button class="btn primary" onclick="applyMoveCf('${arg.kind}','${arg.id}','${arg.type||''}')">移动</button>
    </div>`;
}
function applyMoveCf(kind,id,type){
  const target=S.moveToTarget!==undefined?S.moveToTarget:null;
  S.moveToTarget=undefined;
  if(kind==='asset'){
    const c=ACC_CATS.find(x=>x.id===id);
    if(!c||!target||target===accCatAssetGroup(c)) { backOverlay(); return; }
    const before={cashEq:c.cashEq,inv:c.inv};
    if(target==='cash'){ c.cashEq=true; c.inv=false; }
    else if(target==='investment'){ c.cashEq=false; c.inv=true; }
    else { c.cashEq=false; c.inv=false; }
    backOverlay(); render();
    toast(`「${c.name}」已移至「${(CF_ASSET_GROUPS.find(([k])=>k===target)||[])[1]}」`,'撤销',()=>{ Object.assign(c,before); render(); });
    return;
  }
  const before=cfOf(id);
  if(!target||target===before){ backOverlay(); return; }
  const setLabel=(cid)=>{ if(target==='未分类') delete CASHFLOW[cid]; else CASHFLOW[cid]=target; };
  /* 子分类随父更新（对齐真实实现：移动父分类时同步更新其子分类）；撤销一并还原 */
  const kids=(CATS[type]||[]).filter(c=>c[2]===id);
  const beforeKids=kids.map(c=>[c[0],cfOf(c[0])]);
  setLabel(id);
  kids.forEach(c=>setLabel(c[0]));
  backOverlay(); render();
  toast(`「${catName(type,id)}」已移至「${(CF_ACTIVITY_GROUPS.find(([k])=>k===target)||[])[1]}」`,'撤销',()=>{
    if(before==='未分类') delete CASHFLOW[id]; else CASHFLOW[id]=before;
    beforeKids.forEach(([cid,v])=>{ if(v==='未分类') delete CASHFLOW[cid]; else CASHFLOW[cid]=v; });
    render();
  });
}
function catEditOverlay(arg){
  /* 第十三轮：兼容两类实体 ——
     kind:'acccat' = 账户分类（新增/编辑，名称 + 类型）；默认 = 交易分类（名称 + 上级 + 删除转移）。 */
  if(arg.kind==='acccat'){
    const c=arg.id?ACC_CATS.find(x=>x.id===arg.id):null;
    const d=S.catDraft||{};
    const name=d.name!==undefined?d.name:(c?c.name:'');
    return `
      <div class="field"><label>分类名称</label><input value="${name}" placeholder="如：存款" oninput="S.catDraft={...S.catDraft,name:this.value}"></div>
      ${c?'':`<div class="field"><label>类型</label><select onchange="S.catDraft={...S.catDraft,accType:this.value};renderOverlay()">
        ${[['asset','资产'],['liability','负债']].map(([k,l])=>`<option value="${k}" ${(d.accType||arg.type||'asset')===k?'selected':''}>${l}</option>`).join('')}</select></div>`}
      ${c?`<div class="hint">类型：${c.type==='asset'?'资产':'负债'}（类型不可改；现金等价 / 投资标记在「现金流分类」里改）。</div>`:''}
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="backOverlay()">取消</button>
        <button class="btn primary" onclick="saveAccCatEdit('${arg.id||''}','${arg.type||''}')">保存</button>
      </div>`;
  }
  const type=arg.type;
  const arr=CATS[type]||[];
  const editing=arg.id?arr.find(c=>c[0]===arg.id):null;
  const d=S.catDraft||{};
  /* 现金流属性编辑入口唯一化：本浮层只管名称 / 层级 / 删除转移，
     属性在「现金流量表设置」（现金流量表右端 ⚙「设置」）里改。 */
  /* 新增表单（arg.parent = 从一级行 ⋯「新增子分类」进入时预选上级） */
  if(!editing){
    const parents=arr.filter(c=>!c[2]);
    const parent=d.parent!==undefined?d.parent:(arg.parent||'');
    return `
      <div class="field"><label>分类名称</label><input value="${d.name||''}" placeholder="如：餐饮" oninput="S.catDraft={...S.catDraft,name:this.value}"></div>
      <div class="field"><label>上级分类</label><select onchange="S.catDraft={...S.catDraft,parent:this.value};renderOverlay()">
        <option value="">（作为一级分类）</option>
        ${parents.map(p=>`<option value="${p[0]}" ${parent===p[0]?'selected':''}>${p[1]}</option>`).join('')}</select></div>
      <div class="hint">新分类的现金流归属默认继承上级（一级默认「未分配」）；单独标注请到 现金流量表设置。</div>
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="backOverlay()">取消</button>
        <button class="btn primary" onclick="saveCatEdit('${type}',null)">新增</button>
      </div>`;
  }
  /* 编辑表单：重命名 + 上级分类（移动）+ 删除（转移交易） */
  const name=d.name!==undefined?d.name:editing[1];
  const parent=d.parent!==undefined?d.parent:(editing[2]||'');
  const parents=arr.filter(c=>!c[2]&&c[0]!==editing[0]);
  const kids=arr.filter(c=>c[2]===editing[0]);
  const targets=catOptions(type).filter(o=>o.v!==editing[0]);
  const delHtml=kids.length
    ? `<div class="hint">该分类下有 ${kids.length} 个二级分类，删除前先移动或删除它们。</div>`
    : `<div class="field"><label>删除时转移交易到</label><select onchange="S.catDraft={...S.catDraft,target:this.value}">
        <option value="">选择目标分类…</option>
        ${targets.map(o=>`<option value="${o.v}" ${d.target===o.v?'selected':''}>${o.level?'　'+o.label:o.label}</option>`).join('')}</select></div>
       <button class="btn" style="width:100%" onclick="delCat('${type}','${editing[0]}')">删除分类</button>`;
  return `
    <div class="field"><label>分类名称</label><input value="${name}" oninput="S.catDraft={...S.catDraft,name:this.value}"></div>
    <div class="field"><label>上级分类</label><select onchange="S.catDraft={...S.catDraft,parent:this.value};renderOverlay()">
      <option value="">（作为一级分类）</option>
      ${parents.map(p=>`<option value="${p[0]}" ${parent===p[0]?'selected':''}>${p[1]}</option>`).join('')}</select></div>
    <div class="hint">现金流归属 ${cfOf(editing[0])}（在 现金流量表设置 修改）</div>
    <div class="d-sec" style="margin-top:12px">删除</div>
    ${delHtml}
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="backOverlay()">取消</button>
      <button class="btn primary" onclick="saveCatEdit('${type}','${editing[0]}')">保存</button>
    </div>`;
}
/* 第十三轮：账户分类的新增 / 编辑保存（对齐真实 CategoryForm 的账户分类版） */
function saveAccCatEdit(id,defType){
  const d=S.catDraft||{};
  const name=(d.name||'').trim();
  if(!name){ toast('先填分类名称','提示'); return; }
  if(id){
    const c=ACC_CATS.find(x=>x.id===id);
    if(!c) return;
    const before=c.name;
    c.name=name;
    S.catDraft=null;
    backOverlay(); render();
    toast('分类已更新','撤销',()=>{ c.name=before; render(); });
  }else{
    const nid='ac'+Date.now();
    ACC_CATS.push({id:nid,name,type:d.accType||defType||'asset',cashEq:false,inv:false});
    const nc=ACC_CATS[ACC_CATS.length-1];
    S.catDraft=null;
    backOverlay(); render();
    toast('分类已新增','撤销',()=>{ const i=ACC_CATS.indexOf(nc); if(i>=0) ACC_CATS.splice(i,1); render(); });
  }
}
function saveCatEdit(type,id){  const d=S.catDraft||{};
  const name=(d.name||'').trim();
  if(!name){ toast('先填分类名称','提示'); return; }
  const arr=CATS[type];
  if(id){
    const c=arr.find(x=>x[0]===id);
    if(!c) return;
    if(d.parent===id){ toast('上级分类不能是自己','提示'); return; }
    const before={name:c[1],parent:c[2]};
    c[1]=name;
    if(d.parent!==undefined) c[2]=d.parent||undefined;
    if(d.cf) CASHFLOW[id]=d.cf;
    S.catDraft=null;
    backOverlay(); render();
    toast('分类已更新','撤销',()=>{ c[1]=before.name; c[2]=before.parent||undefined; render(); });
  }else{
    const nid='c'+Date.now();
    arr.push(d.parent?[nid,name,d.parent]:[nid,name]);
    if(d.cf) CASHFLOW[nid]=d.cf;
    S.catDraft=null;
    backOverlay(); render();
    toast('分类已新增','撤销',()=>{ const i=arr.findIndex(x=>x[0]===nid); if(i>=0) arr.splice(i,1); render(); });
  }
}
function delCat(type,id){
  const d=S.catDraft||{};
  const target=d.target;
  const arr=CATS[type]||[];
  if(arr.some(c=>c[2]===id)){ toast('先处理该分类下的二级分类','提示'); return; }
  if(!target){ toast('选择交易要转移到的分类','提示'); return; }
  const i=arr.findIndex(c=>c[0]===id);
  if(i<0) return;
  const [rm]=arr.splice(i,1);
  /* 交易转移到目标分类：与真实实现「删除分类时转移交易」同口径，交易不丢失 */
  const movedIds=TXNS.filter(t=>t.cat===id && catType(t.type)===type).map(t=>t.id);
  TXNS.forEach(t=>{ if(t.cat===id && catType(t.type)===type) t.cat=target; });
  delete CASHFLOW[id];
  S.catDraft=null;
  backOverlay(); render();
  toast(`分类已删除，交易已转移到「${catName(type,target)}」`,'撤销',()=>{
    arr.splice(i,0,rm);
    TXNS.forEach(t=>{ if(movedIds.includes(t.id)) t.cat=id; });
    render();
  });
}

/* ================= M2/M3 · 投资配置浮层 ================= */
/* 目标比例与再平衡：编辑各资产类别的目标比例，合计必须为 100%；
   同时给出当前占比与再平衡金额（对齐真实 InvestmentAssetClass.targetRatio）。 */
function invTargetOverlay(arg){
  const rows=invAllocation();
  const total=rows.reduce((s,r)=>s+r.target,0);
  const ok=Math.abs(total-1)<0.0001;
  if(arg.mode==='new') return invTargetNewForm();
  const editing=arg.id?rows.find(r=>r.id===arg.id):null;
  if(editing){
    const d=S.invTargetDraft||{};
    const name=d.name!==undefined?d.name:editing.name;
    const tgt=d.target!==undefined?d.target:Math.round(editing.target*100);
    return `
      <div class="field"><label>资产类别名称</label><input value="${name}" oninput="S.invTargetDraft={...S.invTargetDraft,name:this.value}"></div>
      <div class="field"><label>目标比例（%）</label><input value="${tgt}" inputmode="numeric" oninput="S.invTargetDraft={...S.invTargetDraft,target:this.value}"></div>
      <div class="hint">当前占比 ${(editing.curRatio*100).toFixed(1)}% · 再平衡金额 ¥${fmt(editing.rebalance)}（正数增持 / 负数减持）。</div>
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="S.invTargetDraft=null;swapOverlay('invtarget',{})">取消</button>
        <button class="btn primary" onclick="saveInvTarget('${editing.id}')">保存</button>
      </div>`;
  }
  /* 评审轮 T5：列表模式收敛为配置行 —— ⠿ 拖拽占位 + 名称/占比摘要 + 行尾「⋯」菜单
     （编辑 / 删除：快照中有持仓的类别禁删）。合计以表下说明给出。 */
  return `
    <div class="hint" style="margin-bottom:12px">目标比例之和应为 100%${ok?'':`（当前 ${(total*100).toFixed(1)}%）`}。</div>
    ${rows.length?rows.map(r=>{
      const key=`cls:${r.id}`;
      const held=INV_SNAPSHOTS.some(s=>(s.items[r.id]||0)>0);
      const menu=S.cfgMenu===key?`<span class="row-menu">
        <button class="row-mi" onclick="swapOverlay('invtarget',{id:'${r.id}'})">编辑</button>
        <button class="row-mi" ${held?'disabled':''} title="${held?'快照中有该类持仓，先清零再删除':'删除资产类别'}" onclick="delInvClass('${r.id}')">删除</button>
      </span>`:'';
      return `<div class="set-item">
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="meta"><span class="t">${r.name}</span>
          <span class="s">当前 ${(r.curRatio*100).toFixed(1)}% · 目标 ${(r.target*100).toFixed(0)}% · 再平衡 ¥${fmt(r.rebalance)}</span></span>
        <span class="row-more-wrap">
          <button class="btn btn-sm" onclick="toggleCfgMenu('${key}')" aria-label="行操作菜单" aria-expanded="${S.cfgMenu===key}">⋯</button>
          ${menu}
        </span>
      </div>`;}).join(''):`<div class="state-wrap"><h2>暂无资产类别</h2><p>点下方「新增」建立第一个类别并设定目标比例。</p></div>`}
    <div class="tbl-note">合计：当前 100.0% · 目标 ${(total*100).toFixed(0)}% · 再平衡 ¥${fmt(rows.reduce((s,r)=>s+r.rebalance,0))}。再平衡金额 = 目标金额 − 当前金额（正数需增持，负数需减持）；总市值口径为最新快照。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn" onclick="swapOverlay('invtarget',{mode:'new'})">＋ 新增资产类别</button>
      <button class="btn primary" onclick="closeOverlay()">完成</button>
    </div>`;
}
function invTargetNewForm(){
  const d=S.invTargetDraft||{};
  return `
    <div class="field"><label>资产类别名称</label><input value="${d.name||''}" placeholder="如：股票" oninput="S.invTargetDraft={...S.invTargetDraft,name:this.value}"></div>
    <div class="field"><label>目标比例（%）</label><input value="${d.target||''}" inputmode="numeric" oninput="S.invTargetDraft={...S.invTargetDraft,target:this.value}"></div>
    <div class="hint">新增后目标比例之和需为 100%；快照的历史金额不受影响。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="S.invTargetDraft=null;swapOverlay('invtarget',{})">取消</button>
      <button class="btn primary" onclick="saveInvTarget(null)">新增</button>
    </div>`;
}
function saveInvTarget(id){
  const d=S.invTargetDraft||{};
  const t=parseFloat(d.target);
  if(!d.name){ toast('先填资产类别名称','提示'); return; }
  if(isNaN(t)||t<0||t>100){ toast('目标比例填 0–100 的数字','提示'); return; }
  if(id){
    const c=INV_CLASSES.find(x=>x.id===id);
    if(c){
      const before={name:c.name,target:c.target};
      c.name=d.name; c.target=t/100;
      S.invTargetDraft=null;
      swapOverlay('invtarget',{}); render();
      toast('目标比例已更新','撤销',()=>{ Object.assign(c,before); render(); });
      return;
    }
  }
  INV_CLASSES.push({id:'ic'+Date.now(),name:d.name,target:t/100});
  const nc=INV_CLASSES[INV_CLASSES.length-1];
  S.invTargetDraft=null;
  swapOverlay('invtarget',{}); render();
  toast('已新增资产类别','撤销',()=>{ const i=INV_CLASSES.indexOf(nc); if(i>=0) INV_CLASSES.splice(i,1); render(); });
}
/* 评审轮 T5：资产类别删除（收进行尾 ⋯ 菜单）—— 快照中有持仓的类别禁删（按钮禁用 + 双保险） */
function delInvClass(id){
  if(INV_SNAPSHOTS.some(s=>(s.items[id]||0)>0)){ toast('快照中有该类持仓，先清零再删除','提示'); return; }
  const i=INV_CLASSES.findIndex(c=>c.id===id);
  if(i<0) return;
  const [rm]=INV_CLASSES.splice(i,1);
  S.cfgMenu=null;
  renderOverlay(); render();
  toast(`已删除资产类别「${rm.name}」`,'撤销',()=>{ INV_CLASSES.splice(i,0,rm); render(); });
}
/* 快照链管理：新增 / 编辑 / 删除快照，删除或新增后自动重排前后链接 */
function invSnapOverlay(arg){
  const sorted=invSorted();
  if(arg.mode==='new') return invSnapNewForm();
  const editing=arg.id?INV_SNAPSHOTS.find(s=>s.id===arg.id):null;
  if(editing){
    const d=S.invDraft||{};
    const date=d.date!==undefined?d.date:editing.date;
    const net=d.net!==undefined?d.net:editing.net;
    const items=d.items||editing.items;
    return `
      <div class="field"><label>快照日期</label><input type="date" value="${date}" onchange="S.invDraft={...S.invDraft,date:this.value}"></div>
      <div class="field"><label>期间净流入（¥）</label><input value="${net}" inputmode="decimal" onchange="S.invDraft={...S.invDraft,net:this.value}"></div>
      <div class="d-sec">各类别市值</div>
      ${INV_CLASSES.map(c=>`<div class="field"><label>${c.name}</label><input value="${items[c.id]||0}" inputmode="decimal" onchange="setInvItem('${c.id}',this.value)"></div>`).join('')}
      <div class="hint">合计 ¥${fmt(invTotalOf(editing))}（按当前表单值之外的历史值）· 修改后快照链会自动重排。</div>
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="delInvSnap('${editing.id}')">删除快照</button>
        <button class="btn" onclick="S.invDraft=null;swapOverlay('invsnap',{})">取消</button>
        <button class="btn primary" onclick="saveInvSnap('${editing.id}')">保存</button>
      </div>`;
  }
  return `
    <div class="hint" style="margin-bottom:12px">快照是投资的时点记录。链上每期快照都指向它的前一期，新增 / 删除后自动重排，不会悬空。</div>
    <table class="inv"><thead><tr><th>快照日期</th><th class="num">市值</th><th class="num">净流入</th><th class="num">前期</th><th></th></tr></thead>
      <tbody>${sorted.map(s=>`<tr>
        <td>${s.date}</td><td class="num">${fmt(invTotalOf(s))}</td><td class="num">${fmt(s.net)}</td>
        <td class="num">${s.prev?s.prev:'—'}</td>
        <td><button class="btn btn-sm" onclick="swapOverlay('invsnap',{id:'${s.id}'})">编辑</button></td></tr>`).join('')}</tbody>
      <tfoot><tr class="tot"><td>合计</td><td class="num">${fmt(invLatestTotal())}</td><td class="num">${fmt(invInflowTotal())}</td><td class="num">—</td><td></td></tr></tfoot>
    </table>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn" onclick="swapOverlay('invsnap',{mode:'new'})">＋ 新增快照</button>
      <button class="btn primary" onclick="closeOverlay()">完成</button>
    </div>`;
}
function invSnapNewForm(){
  const d=S.invDraft||{};
  const invAccs=ACC.filter(accIsInv);
  return `
    <div class="field"><label>快照日期</label><input type="date" value="${d.date||today}" onchange="S.invDraft={...S.invDraft,date:this.value}"></div>
    <div class="field"><label>投资账户</label><select onchange="S.invDraft={...S.invDraft,acc:this.value}">
      ${invAccs.map(a=>`<option value="${a.id}" ${(d.acc||invAccs[0]?.id)===a.id?'selected':''}>${a.name}</option>`).join('')||'<option value="">（无投资账户）</option>'}</select></div>
    <div class="field"><label>期间净流入（¥）</label><input value="${d.net||0}" inputmode="decimal" onchange="S.invDraft={...S.invDraft,net:this.value}"></div>
    <div class="d-sec">各类别市值</div>
    ${INV_CLASSES.map(c=>`<div class="field"><label>${c.name}</label><input value="${(d.items||{})[c.id]||0}" inputmode="decimal" onchange="setInvItem('${c.id}',this.value)"></div>`).join('')}
    <div class="hint">新增后自动接到链尾并重排链接；若日期早于已有快照，会按日期重新排序。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="S.invDraft=null;swapOverlay('invsnap',{})">取消</button>
      <button class="btn primary" onclick="saveInvSnap(null)">新增</button>
    </div>`;
}
function setInvItem(cls,v){
  S.invDraft=S.invDraft||{};
  S.invDraft.items={...(S.invDraft.items||{}),[cls]:v};
}
function saveInvSnap(id){
  const d=S.invDraft||{};
  const items={};
  INV_CLASSES.forEach(c=>{ items[c.id]=parseFloat((d.items||{})[c.id])||0; });
  if(id){
    const s=INV_SNAPSHOTS.find(x=>x.id===id);
    if(s){
      const before={date:s.date,net:s.net,items:{...s.items}};
      if(d.date) s.date=d.date; if(d.net!=null&&d.net!=='') s.net=parseFloat(d.net)||0; if(Object.keys(d.items||{}).length) s.items=items;
      relinkSnapshots();
      S.invDraft=null;
      swapOverlay('invsnap',{}); render();
      toast('快照已更新','撤销',()=>{ Object.assign(s,before); relinkSnapshots(); render(); });
      return;
    }
  }
  INV_SNAPSHOTS.push({id:'s'+Date.now(),date:d.date||today,acc:d.acc||(ACC.find(accIsInv)||{}).id||'brk',
    prev:null,net:parseFloat(d.net)||0,items});
  const ns=INV_SNAPSHOTS[INV_SNAPSHOTS.length-1];
  relinkSnapshots();
  S.invDraft=null;
  swapOverlay('invsnap',{}); render();
  toast('已新增快照','撤销',()=>{ const i=INV_SNAPSHOTS.indexOf(ns); if(i>=0) INV_SNAPSHOTS.splice(i,1); relinkSnapshots(); render(); });
}
function delInvSnap(id){
  const i=INV_SNAPSHOTS.findIndex(s=>s.id===id);
  if(i<0) return;
  const [rm]=INV_SNAPSHOTS.splice(i,1);
  relinkSnapshots();
  S.invDraft=null;
  closeOverlay(); render();
  toast('已删除快照','撤销',()=>{ INV_SNAPSHOTS.splice(i,0,rm); relinkSnapshots(); render(); });
}

/* ================= W8 · 导入 / 回滚 ================= */
/* M7：真实实现的导入形态是 ZIP / CSV / JSON 自动识别 + 合并 / 覆盖二选一，
   导入前自动建回滚点，覆盖前必须预览。原型按此三步重排。 */
function importOverlay(arg){
  const step=S.importStep;
  const steps=`<div class="wiz-steps">
    <div class="${step===1?'on':''}">1 选择文件</div>
    <div class="${step===2?'on':''}">2 预览与方式</div>
    <div class="${step===3?'on':''}">3 建回滚点</div>
  </div>`;
  if(step===1){
    /* Q6（按推荐值 A）：PC 拖放区 / 移动端系统文件选择器。
       评审轮 B1：PC 拖放区是 label 包裹 input —— 整块可点（点击即开文件选择器），
       不再是死 DIV；未选文件时「下一步」旁常驻「先选择文件」提示。 */
    const picker = S.device==='m'
      ? `<label class="btn primary" style="display:inline-block;padding:9px 16px">选择文件（系统文件选择器）<input type="file" class="sr-only" accept=".zip,.csv,.json" onchange="pickFile(this.files[0]&&this.files[0].name)"></label>`
      : `<label class="drop">把 ZIP / CSV / JSON 拖到这里<br><span class="lbl">或点击选择文件（格式自动识别）</span><input type="file" class="sr-only" accept=".zip,.csv,.json" onchange="pickFile(this.files[0]&&this.files[0].name)"></label>`;
    return `${steps}
      <div class="d-sec">第 1 步 · 选择文件</div>
      ${picker}
      ${S.importFile?`<div class="hint" style="margin-top:12px">已选择：${S.importFile} · 识别格式：${importFmtLabel()}</div>`:''}
      <div class="hint" style="margin-top:12px">
        · <b>ZIP</b>：完整备份包（含流水、账户、分类、预算、快照），用于整体迁移。<br>
        · <b>CSV</b>：单表流水，只能导入流水。<br>
        · <b>JSON</b>：结构化单表，可指定表名。<br>
        格式由扩展名自动识别，识别为 ZIP 时不再询问。
      </div>
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="closeOverlay()">取消</button>
        ${S.importFile?'':'<span class="lbl" style="flex:none">先选择文件</span>'}
        <button class="btn primary" onclick="S.importStep=2;renderOverlay()" ${S.importFile?'':'disabled'}>下一步</button>
      </div>`;
  }
  if(step===2){
    const merge=S.importMode==='merge';
    return `${steps}
      <div class="d-sec">第 2 步 · 预览与导入方式</div>
      <table class="inv"><thead><tr><th>行</th><th>日期</th><th>分类</th><th>金额</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>2026-10-02</td><td>餐饮</td><td class="num">32.00</td></tr>
        <tr><td>2</td><td>2026-10-03</td><td>交通</td><td class="num">4.00</td></tr>
        <tr><td>3</td><td>2026-10-04</td><td>购物</td><td class="num">219.00</td></tr>
      </tbody></table>
      <div class="hint" style="margin-top:12px">识别到 128 笔：96 笔与现有流水重复、32 笔为新增（示例数据，仅预览前 5 行）。</div>
      <div class="d-sec">导入方式</div>
      <div class="imp-mode">
        <button class="imp-opt ${merge?'on':''}" onclick="setImportMode('merge')">
          <span class="t">合并</span><span class="s">按日期 + 金额 + 分类去重；重复项跳过，新增项追加。既有数据不被删除。</span></button>
        <button class="imp-opt ${!merge?'on':''}" onclick="setImportMode('overwrite')">
          <span class="t">覆盖</span><span class="s">按文件声明的期间整段替换：该期间现有流水全部清空后写入，其余月份、账户余额、预算与设置保留。</span></button>
      </div>
      ${merge?`<div class="hint">合并模式不删除任何现有流水。</div>`
        :`<div class="bud-over"><span class="lab">覆盖前预览：将被替换的是 2026 年 10 月的全部流水（当前 13 笔），替换后为 128 笔。</span></div>`}
      <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
        <button class="btn ghost" onclick="S.importStep=1;renderOverlay()">上一步</button>
        <button class="btn primary" onclick="S.importStep=3;renderOverlay()">下一步</button>
      </div>`;
  }
  return `${steps}
    <div class="d-sec">第 3 步 · 建回滚点</div>
    <div class="lv-list">
      <div class="lv"><span class="k">回滚点</span><span class="v">导入前自动备份 · 2026-10-29 04:12</span></div>
      <div class="lv"><span class="k">文件</span><span class="v">${S.importFile||'—'} · ${importFmtLabel()}</span></div>
      <div class="lv"><span class="k">导入方式</span><span class="v">${S.importMode==='merge'?'合并（去重后追加）':'覆盖（替换文件声明期间）'}</span></div>
      <div class="lv"><span class="k">影响范围</span><span class="v">${S.importMode==='merge'?'仅追加 32 笔，其余不动':'2026 年 10 月 的全部流水（其余月份 / 账户余额 / 预算 / 设置保留）'}</span></div>
    </div>
    <div class="hint" style="margin-top:12px">回滚点在导入前自动建立，无需手动操作；导入后可从「回滚点」恢复。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="S.importStep=2;renderOverlay()">上一步</button>
      <button class="btn primary" onclick="doImport()">${S.importMode==='merge'?'确认合并导入':'确认覆盖导入'}</button>
    </div>`;
}
/* 扩展名 → 格式标签 */
function importFmtLabel(){
  const f=(S.importFile||'').toLowerCase();
  if(f.endsWith('.zip')) return 'ZIP 备份包';
  if(f.endsWith('.csv')) return 'CSV 流水';
  if(f.endsWith('.json')) return 'JSON 单表';
  return '未识别';
}
function setImportMode(m){ S.importMode=m; renderOverlay(); }
function pickFile(name){ S.importFile=name||'example.csv'; S.importStep=1; renderOverlay(); }
function doImport(){
  const merge=S.importMode==='merge';
  if(!merge) logOp('覆盖导入（2026 年 10 月流水被替换）');
  S.importStep=1; S.importFile=null; S.importMode='merge';
  closeOverlay();
  render();
  /* 撤销 = 走「还原前」回滚点（导入前已自动建点，原型以 toast 演示） */
  toast(merge?'已合并导入 32 笔':'已覆盖导入 128 笔','撤销',
    ()=>toast('已通过导入前回滚点撤销本次导入（原型演示）'));
}
/* 评审轮 T3：回滚恢复两步确认（第一次点变「确认恢复」，3s 未确认自动复位）；
   执行前自动创建「还原前」回滚点 —— 恢复本身也是一次数据变更，必须同样可回滚。 */
function rollbackOverlay(){
  return `
    <div class="hint" style="margin-bottom:12px">回滚会把全部数据恢复到所选备份点。执行前会<b>自动创建「还原前」回滚点</b>——恢复错了还能再回滚。</div>
    ${S.rollbackPts.map(p=>`
      <div class="rb-item">
        <span class="acct-ico">${I.hist}</span>
        <span class="meta"><span class="t">${p.name}</span><span class="s">${p.note} · ${p.size}</span></span>
        <button class="btn btn-sm ${S.rbConfirm===p.name?'confirming':''}" onclick="restoreRollback('${p.name}')">${S.rbConfirm===p.name?'确认恢复':'恢复'}</button>
      </div>`).join('')}`;
}
function restoreRollback(name){
  if(S.rbConfirm!==name){
    S.rbConfirm=name; renderOverlay();
    setTimeout(()=>{ if(S.rbConfirm===name){ S.rbConfirm=null; renderOverlay(); } },3000);
    return;
  }
  S.rbConfirm=null;
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const ts=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  S.rollbackPts.unshift({name:`${ts} · 还原前自动备份`,size:'1.5 MB',note:'还原前自动'});
  logOp(`回滚恢复到「${name}」（已自动创建还原前回滚点）`);
  closeOverlay();
  render();
  toast(`已恢复到「${name}」· 已自动创建「还原前」回滚点`);
}

/* ================= W3 · 批量删除确认（评审轮 T2） ================= */
function batchDelConfirm(){
  const n=S.sel.size;
  if(!n) return `<div class="hint">尚未选择交易。</div>`;
  return `
    <div class="hint">将删除<b>共 ${n} 笔</b>交易。删除后底部提示条的「撤销」可<b>一次恢复全部</b>。</div>
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="closeOverlay()">取消</button>
      <button class="btn primary" onclick="doBatchDel()">确认删除 ${n} 笔</button>
    </div>`;
}
function doBatchDel(){
  const ids=Array.from(S.sel);
  if(!ids.length){ closeOverlay(); return; }
  const removed=TXNS.filter(t=>ids.includes(t.id));
  TXNS.splice(0,TXNS.length,...TXNS.filter(t=>!ids.includes(t.id)));
  S.sel.clear(); S.batch=false;
  closeOverlay();
  render();
  toast(`已删除 ${removed.length} 笔`,'撤销',()=>{ TXNS.push(...removed); render(); });
}

/* ================= 统一时间面板（第十四轮重写 · 第十五轮粒度外置） =================
   PC 浮层（.period-pop）与移动抽屉（period overlay）共用 timePanelHtml()；
   时点与期间只差「有没有起止两步」，没有第二套组件。
   面板元素顺序（规范固定）：预设 chips → 自定义（时点=日历单端点 /
   期间=起止 pill 两步 + 年步进 + 按粒度裁剪的网格）→ 取消 / 应用。
   第十五轮：粒度分段已挪出面板、常驻时间条（规范维度 9「粒度归属」）；
   面板日历只展示「当前粒度及以下」的层级——年=年步进+12 格年网格（无月无日）、
   月=年步进+月网格（无日）、日=年步进+月网格+日网格。 */
const PERIOD_PRESETS=[['today','今天'],['7d','近 7 天'],['thism','本月'],['prevm','上月'],['quarter','本季'],['thisy','今年'],['12m','近 12 个月']];
const ppEndText=v=>v||(v===undefined?'未选':'未选');
/* 草稿端点设置：期间语义下选完「起」自动进「止」；时点语义单端点即 from */
function ppSetEnd(y,m,d){
  const s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dft=S.timeDraft||{from:null,to:null,end:'from'};
  if(isPointReport()){ S.timeDraft={...dft,from:s}; }
  else if(dft.end==='from'){ S.timeDraft={...dft,from:s,end:'to'}; }
  else { S.timeDraft={...dft,to:s}; }
  if(S.overlay==='period') renderOverlay(); else render();
}
function setPpEnd(e){
  if(!S.timeDraft) return;
  S.timeDraft.end=e;
  if(S.overlay==='period') renderOverlay();
}
function ppSetYear(dir){
  const dft=S.timeDraft||{from:null,to:null,end:'from'};
  const cur=isPointReport()?dft.from:(dft.end==='from'?dft.from:dft.to);
  const base=cur?Object.assign({},s2d(cur)):{...S.repTime,d:S.timeGran==='day'?S.repTime.d:1};
  const y=base.y+dir;
  if(isPointReport()) ppSetEnd(y,base.m,base.d);
  else ppSetEnd(y,base.m,S.timeGran==='day'?base.d:1);
}
/* 年网格点选（year 粒度）：期间 from=该年 1-1 / to=该年 12-31（端点各自取整年）；
   时点=该年 12-31（锚年末，与 snapPointToGran 同口径） */
function ppSetYearPick(y){
  if(isPointReport()) ppSetEnd(y,12,31);
  else if((S.timeDraft||{}).end==='to') ppSetEnd(y,12,31);
  else ppSetEnd(y,1,1);
}
function timePanelHtml(){
  const d=S.timeDraft||{from:null,to:null,end:'from'};
  const point=isPointReport();
  const g=S.timeGran;
  const presets=`<div class="pp-sec">预设</div>
    <div class="preset-row">${PERIOD_PRESETS.map(([k,l])=>{
      const ok=presetOkForGran(k);
      return `<button class="btn btn-sm ${!S.repRange&&S.repLabel===l?'on':''}" ${ok?'':'disabled'} onclick="pickTimePreset('${k}')">${l}</button>`;
    }).join('')}</div>`;
  const cur=isPointReport()?d.from:(d.end==='from'?d.from:d.to);
  const base=cur?Object.assign({},s2d(cur)):{y:S.repTime.y,m:S.repTime.m,d:1};
  const year=`<div class="pp-sec">年</div>
    <div class="d-year">
      <button class="btn btn-sm" onclick="ppSetYear(-1)">‹</button>
      <span class="num" style="font-size:var(--mb-fs-4);font-weight:700">${base.y}</span>
      <button class="btn btn-sm" onclick="ppSetYear(1)">›</button>
    </div>`;
  /* 网格按「当前粒度及以下」裁剪：年=12 格年网格（无月无日）/ 月=12 格月网格（无日）/ 日=月网格+31 格日网格 */
  const yearGrid=g==='year'
    ? `<div class="d-grid" style="grid-template-columns:repeat(4,1fr)">
         ${Array.from({length:12},(_,i)=>base.y-5+i).map(yy=>`<button class="${base.y===yy?'on':''}" onclick="ppSetYearPick(${yy})">${yy}</button>`).join('')}
       </div>`:'';
  const monthGrid=g!=='year'
    ? `<div class="pp-sec">月</div>
       <div class="d-grid" style="grid-template-columns:repeat(6,1fr)">
         ${Array.from({length:12},(_,i)=>i+1).map(mm=>{
           const dd=point&&g==='month'?new Date(base.y,mm,0).getDate():(g==='day'?base.d:1);
           return `<button class="${base.m===mm?'on':''}" onclick="ppSetEnd(${base.y},${mm},${dd})">${mm}</button>`;}).join('')}
       </div>`:'';
  const dayGrid=g==='day'
    ? `<div class="pp-sec">日</div>
       <div class="d-grid" style="grid-template-columns:repeat(7,1fr)">
         ${Array.from({length:31},(_,i)=>i+1).map(dd=>`<button class="${base.d===dd?'on':''}" onclick="ppSetEnd(${base.y},${base.m},${dd})">${dd}</button>`).join('')}
       </div>`:'';
  const cal=`${year}${yearGrid}${monthGrid}${dayGrid}`;
  const custom=point
    ? `<div class="pp-sec">自定义日期</div>${cal}`
    : `<div class="pp-sec">自定义 · 正在选「${d.end==='from'?'起':'止'}」</div>
       <div class="pp-ends">
         <button class="pp-end ${d.end==='from'?'on':''}" onclick="setPpEnd('from')">起<br><b>${ppEndText(d.from)}</b></button>
         <span class="pp-end-sep">–</span>
         <button class="pp-end ${d.end==='to'?'on':''}" onclick="setPpEnd('to')">止<br><b>${ppEndText(d.to)}</b></button>
       </div>${cal}`;
  return `${presets}${custom}
    <div class="entry-actions" style="padding-left:0;padding-right:0;margin-top:12px">
      <button class="btn ghost" onclick="closeTimePanel(true)">取消</button>
      <button class="btn primary" onclick="applyTimeDraft()">应用</button>
    </div>`;
}
/* PC：浮层壳（挂时间条正下方；标题 + 关闭 = 取消语义） */
function periodPopPc(){
  return `<div class="period-pop">
    <div class="pp-head"><span>选择时间</span><button class="icon-btn" onclick="closeTimePanel(true)" aria-label="关闭">${I.x}</button></div>
    ${timePanelHtml()}
  </div>`;
}
function periodOverlay(){ return timePanelHtml(); }
