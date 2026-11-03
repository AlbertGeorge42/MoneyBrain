/* ============================================================
   MoneyBrain · 线框级原型 · 数据 / 状态 / 视图
   ------------------------------------------------------------
   · 无外部依赖：无 CDN、无图表库、无图标库（图标全为内联 SVG）
   · 灰阶线框：图表用斜纹占位块，分类/账户用占位字符块
   · 结构按 [concept-design.md](../concept-design.md) 的六模块两套结构落地
   ============================================================ */

/* ================= 数据 ================= */
/* 账户分类树（对齐真实实现 AccountCategory）：
   账户挂在分类下；分类决定报表口径 —— 资产/负债、现金等价、是否投资账户。
   「现金等价」与「投资账户」是分类上的标记，不再是账户自己的 kind 字符串；
   现金流量表设置（cfcfg）按这两个标记给资产分类分组，移动即改标记（第十二轮）。 */
const ACC_CATS = [
  {id:'cash_eq', name:'现金等价', type:'asset',  cashEq:true,  inv:false},
  {id:'deposit', name:'存款',     type:'asset',  cashEq:false, inv:false},
  {id:'broker',  name:'证券账户', type:'asset',  cashEq:false, inv:true},
  {id:'credit',  name:'信用负债', type:'liability', cashEq:false, inv:false},
];
const ACC = [
  {id:'cmb',   name:'招商储蓄卡', cat:'deposit', bal:48230.55},
  {id:'wx',    name:'微信零钱',   cat:'cash_eq', bal:1286.20},
  {id:'zfb',   name:'支付宝',     cat:'cash_eq', bal:3540.00},
  {id:'xyk',   name:'交行信用卡', cat:'credit',  bal:-2118.40},
  {id:'brk',   name:'长桥证券',   cat:'broker',  bal:86450.00},
];
const accCat = id => ACC_CATS.find(c=>c.id===id) || ACC_CATS[0];
const accIsCashEq = a => accCat(a.cat).cashEq;
const accIsInv = a => accCat(a.cat).inv;
const accCatName = id => accCat(id).name;
/* 账户性质标签：分类名 + 标记（现金等价 / 投资账户） */
const accKind = a => accCat(a.cat).name + (accCat(a.cat).cashEq?' · 现金等价':accCat(a.cat).inv?' · 投资账户':'');
/* 分类支持二级：第 3 个元素是父分类 id（一级分类无第 3 个元素）。
   对齐真实实现 TransactionCategory.parentId 的分类树。
   O3：退款 / 对账调整不另建分类树 —— 交易类型仍分 refund / adjustment，
   但归类时复用普通分类（refund→收入类、adjustment→支出类）。 */
const CATS = {
  expense:[['food','餐饮'],['food_lunch','午餐','food'],['food_takeout','外食','food'],
           ['shop','购物'],['shop_daily','日用','shop'],['shop_cloth','服饰','shop'],
           ['traffic','交通'],['home','居住'],['fun','娱乐'],['health','医疗'],['edu','教育'],['other','其他']],
  income:[['salary','工资'],['inv','理财收益'],['gift','红包'],['refund','退款']],
  transfer:[['move','账户互转']],
};
/* 交易类型 → 分类树：退款与调整复用普通分类 */
const catType = t => t==='refund'?'income':t==='adjustment'?'expense':t;
/* 现金流属性是分类的「局部字段」，不做全局配置页（concept-design.md W5）。
   取值与真实实现一致：operating / investing / financing / uncategorized
   → 经营 / 投资 / 筹资 / 未分类。二级分类未单独标注时继承一级分类的属性。 */
const CASHFLOW = {
  food:'经营',food_lunch:'经营',food_takeout:'经营',
  shop:'经营',shop_daily:'经营',shop_cloth:'经营',
  traffic:'经营',home:'经营',fun:'经营',health:'经营',edu:'经营',
  salary:'筹资',inv:'投资',move:'筹资',
  other:'未分类',gift:'未分类',refund:'未分类',fix:'未分类',
};
const CF_VALUES = ['经营','投资','筹资','未分类'];
/* 属性查自身 → 查父分类 → 都没标就是「未分类」 */
const cfOf = id => {
  if(CASHFLOW[id]) return CASHFLOW[id];
  const tp=Object.keys(CATS).find(t=>(CATS[t]||[]).some(c=>c[0]===id));
  const p=tp?catParentOf(tp,id):null;
  return p?(CASHFLOW[p]||'未分类'):'未分类';
};
const TXNS = [
  {id:'t1', date:'2026-10-28', type:'expense', cat:'food_lunch',  note:'午餐·公司食堂',    acc:'wx',   amt:28.00},
  {id:'t2', date:'2026-10-28', type:'expense', cat:'traffic', note:'地铁通勤',         acc:'wx',   amt:6.00},
  {id:'t3', date:'2026-10-27', type:'expense', cat:'shop_daily', note:'山姆会员商店',     acc:'cmb',  amt:328.60},
  {id:'t4', date:'2026-10-27', type:'transfer',cat:'move',    note:'转入证券账户',     acc:'cmb',  toAcc:'brk', amt:5000.00, fee:2.00},
  {id:'t5', date:'2026-10-26', type:'income',  cat:'salary',  note:'十月工资',         acc:'cmb',  amt:18500.00},
  {id:'t6', date:'2026-10-25', type:'expense', cat:'fun',     note:'电影《沙丘 3》',   acc:'zfb',  amt:79.00},
  {id:'t7', date:'2026-10-24', type:'refund',  cat:'refund',  note:'退货·保温杯',      acc:'wx',   amt:129.00},
  {id:'t8', date:'2026-10-23', type:'expense', cat:'home',    note:'十月房租',         acc:'cmb',  amt:5600.00},
  {id:'t9', date:'2026-10-22', type:'expense', cat:'health',  note:'药店·感冒药',      acc:'zfb',  amt:46.50},
  {id:'t10',date:'2026-10-20', type:'adjustment',cat:'other',   note:'对账修正',         acc:'wx',   amt:-2.40},
  {id:'t11',date:'2026-10-18', type:'expense', cat:'food_takeout', note:'周末火锅',     acc:'cmb',  amt:286.00, coupon:20},
  {id:'t12',date:'2026-10-15', type:'expense', cat:'edu',     note:'得到年度课程',     acc:'zfb',  amt:199.00},
  {id:'t13',date:'2026-10-05', type:'expense', cat:'shop_daily', note:'山姆月度采购',  acc:'cmb',  amt:928.60},
];
/* 预算条目（对齐真实实现 Budget：name/type/amount/period/category/account）。
   不再是「每个分类一个月度固定额度」，而是独立的预算条目：
   名称 + 类型（支出/收入/转账）+ 金额 + 周期 + 分类 + 账户。 */
const BUDGET_PERIODS=[['monthly','月度'],['weekly','每周'],['quarterly','季度'],['yearly','年度']];
const BUDGETS=[
  {id:'b1',name:'餐饮',     type:'expense',  period:'monthly',   amount:1500, cat:'food',    acc:'cmb'},
  {id:'b2',name:'居住',     type:'expense',  period:'monthly',   amount:5600, cat:'home',    acc:'cmb'},
  {id:'b3',name:'购物',     type:'expense',  period:'monthly',   amount:800,  cat:'shop',    acc:'cmb'},
  {id:'b4',name:'娱乐',     type:'expense',  period:'monthly',   amount:300,  cat:'fun',     acc:'zfb'},
  {id:'b5',name:'交通',     type:'expense',  period:'weekly',    amount:100,  cat:'traffic', acc:'wx'},
  {id:'b6',name:'教育',     type:'expense',  period:'yearly',    amount:2000, cat:'edu',     acc:'zfb'},
  {id:'b7',name:'工资入账', type:'income',   period:'monthly',   amount:18500,cat:'salary',  acc:'cmb'},
  {id:'b8',name:'账户互转', type:'transfer', period:'monthly',   amount:5000, cat:'move',    acc:'cmb'},
];
/* 投资：资产类别（含目标比例）+ 快照链（对齐真实实现 InvestmentAssetClass /
   InvestmentAllocationSnapshot / InvestmentAllocationItem）。
   快照链是派生数据：新增/编辑/删除后重排 prev 指针（对齐 allocation.service.ts 的 relinkSnapshots）。 */
const INV_CLASSES=[
  {id:'eq',   name:'股票',     target:0.50},
  {id:'bond', name:'债券基金', target:0.30},
  {id:'cash', name:'现金',     target:0.20},
];
const INV_SNAPSHOTS=[
  {id:'s1',date:'2026-04-30',acc:'brk',prev:null,net:0,    items:{eq:32000,bond:18000,cash:10000}},
  {id:'s2',date:'2026-05-31',acc:'brk',prev:'s1',net:2500, items:{eq:33000,bond:18500,cash:11000}},
  {id:'s3',date:'2026-06-30',acc:'brk',prev:'s2',net:3000, items:{eq:35000,bond:19000,cash:11800}},
  {id:'s4',date:'2026-07-31',acc:'brk',prev:'s3',net:4000, items:{eq:37000,bond:20200,cash:13000}},
  {id:'s5',date:'2026-08-31',acc:'brk',prev:'s4',net:6000, items:{eq:40500,bond:21500,cash:14800}},
  {id:'s6',date:'2026-09-30',acc:'brk',prev:'s5',net:5000, items:{eq:43500,bond:23000,cash:15900}},
  {id:'s7',date:'2026-10-28',acc:'brk',prev:'s6',net:0,    items:{eq:45200,bond:24350,cash:16900}},
];
const fmt = n => Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const abs = n => fmt(Math.abs(n));
const sgn = (n,s) => `${s||''}${fmt(Math.abs(n))}`;
const today = '2026-10-28';
const TYPE_CN={expense:'支出',income:'收入',transfer:'转账',refund:'退款',adjustment:'调整'};
const dCN = d => { const dd=+d.split('-')[2]; const wk='日一二三四五六'[new Date(d).getDay()]; return d===today?`今天 · 10月${dd}日 周${wk}`:`10月${dd}日 周${wk}`; };
/* 分类辅助：支持二级（父 → 子），对齐真实实现 TransactionCategory.parentId。
   退款 / 调整走普通分类树（catType 映射），所以按交易类型取分类时先映射一次。 */
const catDef = (type,cat) => (CATS[catType(type)]||[]).find(c=>c[0]===cat);
const catName = (type,cat) => catDef(type,cat)?.[1] || cat;
const catParentOf = (type,cat) => catDef(type,cat)?.[2] || null;
const catChildrenOf = (type,cat) => (CATS[catType(type)]||[]).filter(c=>c[2]===cat);
/* 子树 = 自身 + 全部后代（递归）：移动一级分类到别处时子树整体跟随
   （子分类父指针不变、层级变深），报表聚合 / 命中 / 扁平列表都要能吃到三级链 */
const catSubtree = (type,cat) => [cat,...catChildrenOf(type,cat).flatMap(c=>catSubtree(type,c[0]))];
/* 选项标签带父级路径：餐饮 / 午餐 */
const catLabel = (type,cat) => { const d=catDef(type,cat); return d&&d[2]?`${catName(type,d[2])} / ${d[1]}`:(d?d[1]:cat); };
/* 条件命中：选父分类时其子分类一并命中（与真实分类树下钻一致） */
const catHit = (cat,cond) => {
  if(!cond) return true;
  if(cat===cond) return true;
  return Object.keys(CATS).some(t=>catSubtree(t,cond).includes(cat));
};
/* 选择器用的扁平列表：父在前、子缩进（递归——移动产生的三级链也能正确列出） */
function catOptions(type){
  const defs=CATS[catType(type)]||[]; const out=[];
  const kidsOf=id=>defs.filter(c=>c[2]===id);
  defs.filter(c=>!c[2]).forEach(p=>{
    out.push({v:p[0],label:p[1],level:0});
    const walk=(id,lv)=>kidsOf(id).forEach(k=>{ out.push({v:k[0],label:k[1],level:lv}); walk(k[0],lv+1); });
    walk(p[0],1);
  });
  return out;
}
const accName = id => ACC.find(a=>a.id===id)?.name || id;

/* ================= 状态 ================= */
const S = {
  view:'dash', dataState:'normal', device:'pc',
  search:'', typeFilter:undefined, batch:false, sel:new Set(),
  repTab:'balance',
  entryOpen:false, entryDevice:'pc', entryType:'expense', entryCat:'food', entryCatPicked:false, entryAmt:'',
  entryAcc:null, entryToAcc:null, entryNote:'', entryFee:'', entryCoupon:'', entryDate:null,
  entryMore:false, savedCount:0, savedSum:0,
  recentAccs:[],                            /* 第十一轮：分级 chips 的最近使用账户（前 5） */
  accPickFn:null, accPickQ:'',              /* 第十一轮：全部账户二级抽屉（目标字段 + 搜索词） */
  filters:{acc:'',cat:'',min:'',max:'',from:'',to:''}, filterOpen:false,
  /* ===================== 时间选择状态机（第十四轮重写，唯一权威见 concept-design.md W6 规范表） =====================
     语义由报表决定：balance=时点 / 其余=期间。S.timeGran 粒度三分。
     已生效值 = S.repTime（时点锚定日）+ S.repRange（期间起止，null=预设/锚点）+ S.repLabel（预设名，null=自定义）。
     草稿值（面板内未应用）= S.timeDraft {from,to,end}；取消丢弃草稿、应用写回并清草稿。 */
  repTime:{y:+today.slice(0,4),m:+today.slice(5,7),d:+today.slice(8,10)}, repSide:'a', repLabel:'本月', repRange:null,
  periodPop:false, timeGran:'month', timeDraft:null,
  folded:new Set(), notesOpen:false,
  txPage:1, txPageSize:8, batchMore:false,
  txEdit:null, accDraft:null, budDraft:null, importStep:1, importFile:null, importMode:'merge',
  invDraft:null, invTargetDraft:null,
  repViews:['balance','flow','cash','invest'],
  txDensity:'normal',                       /* O6：列表密度（紧凑 / 标准），记忆在 localStorage；入口在设置 › 列表显示 */
  txCols:{fee:true,coupon:true,typeTag:true}, /* 流水可选列（示意列显示配置，入口在设置 › 列表显示） */
  txColOrder:['fee','coupon','typeTag'],    /* 可选列顺序（第七轮：勾选显隐；评审轮 T5：排序以 ⠿ 拖拽占位表达） */
  catTab:'income',                          /* 收支分类设置 Tab（第十三轮：对齐真实 TransactionConfigModal 默认收入） */
  accTab:'asset',                           /* 第十三轮：账户分类管理 Tab（资产 / 负债，对齐真实 AccountConfigModal） */
  cfTab:'asset',                            /* 第十二轮：现金流量表设置 Tab（资产/收入/支出/转账，对齐真实实现） */
  setTab:'acctcfg',                         /* 第十二轮：PC 设置页左导航当前分区（与移动端列表一一对应） */
  accConfirm:null,                          /* 账户行内删除的两步确认（第七轮：第一次点变「确认删除」，3s 未确认自动复位） */
  cfgMenu:null,                             /* 评审轮 T5：配置行行尾「⋯」菜单的展开键（一个菜单一次只开一个） */
  rbConfirm:null,                           /* 评审轮 T3：回滚「恢复」的两步确认（第一次点变「确认恢复」，3s 自动复位） */
  recycle:[                                 /* 回收站（B2 蓝图特性，线框示意） */
    {id:'t9x',txt:'医疗 · 药店·感冒药',amt:46.50,delAt:'2026-10-26 09:12'},
    {id:'t12x',txt:'教育 · 得到年度课程',amt:199.00,delAt:'2026-10-24 22:40'},
  ],
  opLog:[],                                /* O4：危险操作留痕 */
  rollbackPts:[
    {name:'2026-10-29 03:00 · 自动备份',size:'1.6 MB',note:'每日自动'},
    {name:'2026-10-15 09:12 · 手动备份',size:'1.4 MB',note:'手动'},
  ],
};
const $ = s=>document.querySelector(s);

/* ================= 图标（内联 SVG，无图标库） ================= */
const I={
 dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
 rep:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-5M12 16V8M16 16v-3"/></svg>',
 budget:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>',
 set:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
 trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
 edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>',
 chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
 filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8Z"/></svg>',
 up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
 down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
 undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h11a5 5 0 0 1 0 10H8"/><path d="m7 6-4 4 4 4"/></svg>',
 hist:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>',
 foldDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
 foldRight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
};
/* 占位字符块：线框级不画真实图标，用首字表示对象（灰块 + 字） */
const glyph = t => `<span class="em">${String(t).slice(0,1)}</span>`;
const catGlyph = name => `<span class="em">${String(name).slice(0,1)}</span>`;

/* ================= 交易计算 ================= */
/* 金额符号按「交易方向」而不是数值正负：支出 28 元是 −28，收入 28 元是 +28，
   转账与对账调整不带方向符号。列表与下钻统一走这里。 */
function txSign(tx){
  if(tx.type==='income'||tx.type==='refund') return '+';
  if(tx.type==='expense') return '−';
  return '';
}
function txFlow(t){
  if(t.type==='income'||t.type==='refund') return t.amt;
  if(t.type==='expense') return -t.amt;
  if(t.type==='adjustment') return t.amt;
  return 0;
}
function txHaystack(t){
  return [t.note,accName(t.acc),catName(t.type,t.cat),TYPE_CN[t.type]||'',String(t.amt)].join(' ').toLowerCase();
}
function activeFilterCount(){
  const f=S.filters; return ['acc','cat','min','max','from','to'].filter(k=>f[k]).length;
}
function txPass(t,kw){
  const f=S.filters;
  if(S.typeFilter && t.type!==S.typeFilter) return false;
  if(kw && !txHaystack(t).includes(kw)) return false;
  if(f.acc && t.acc!==f.acc && t.toAcc!==f.acc) return false;
  if(f.cat && !catHit(t.cat,f.cat)) return false;
  if(f.min && Math.abs(t.amt)<parseFloat(f.min)) return false;
  if(f.max && Math.abs(t.amt)>parseFloat(f.max)) return false;
  if(f.from && t.date<f.from) return false;
  if(f.to && t.date>f.to) return false;
  return true;
}
/* 行内可选信息受 设置›列表显示 的列显示控制 */
function amtHtml(tx){
  const sign=txSign(tx);
  const sub = tx.type==='transfer' ? `→ ${accName(tx.toAcc)}`
    : tx.fee&&S.txCols.fee ? `含手续费 ${fmt(tx.fee)}`
    : tx.coupon&&S.txCols.coupon ? `券 −${fmt(tx.coupon)}` : '';
  return `<div class="tx-amt">${tx.amt<0&&!sign?'−':''}${sign}${abs(tx.amt)}${sub?`<small>${sub}</small>`:''}</div>`;
}
const typeTagHtml = t => S.txCols.typeTag?` · <span class="tag">${TYPE_CN[t]}</span>`:'';
/* Q1（第六轮拍板）：行内编辑 / 删除按钮移除 —— 点击行进详情，
   编辑与删除都在详情里做（W4 已有）；行只保留「读 + 选择」两种职责 */
function txRowPc(tx){
  const on=S.sel.has(tx.id);
  const title=`${catName(tx.type,tx.cat)}${tx.note?' · '+tx.note:''}`;
  return `<div class="tx-row ${on?'sel':''}" data-id="${tx.id}" onclick="rowClick('${tx.id}')" title="点击查看详情">
    <button class="tx-check ${on?'on':''}" role="checkbox" aria-checked="${on}" aria-label="选择 ${title}" onclick="event.stopPropagation();toggleSel('${tx.id}')">✓</button>
    <span class="cat-ico" aria-hidden="true">${catGlyph(catName(tx.type,tx.cat))}</span>
    <div class="tx-main">
      <div class="t">${catName(tx.type,tx.cat)}${tx.note?` · ${tx.note}`:''}</div>
      <div class="s">${accName(tx.acc)}${typeTagHtml(tx.type)}</div>
    </div>
    ${amtHtml(tx)}
  </div>`;
}
/* 移动端行：同 PC 口径 —— 无行内操作列，标题独占上行，点击进详情 */
function txRowM(tx){
  const on=S.sel.has(tx.id);
  const title=`${catName(tx.type,tx.cat)}${tx.note?' · '+tx.note:''}`;
  return `<div class="m-tx-row ${on?'sel':''}" data-id="${tx.id}" onclick="rowClick('${tx.id}')">
    <button class="tx-check ${on?'on':''}" role="checkbox" aria-checked="${on}" aria-label="选择 ${title}" onclick="event.stopPropagation();toggleSel('${tx.id}')">✓</button>
    <span class="cat-ico" aria-hidden="true">${catGlyph(catName(tx.type,tx.cat))}</span>
    <div class="m-line1"><div class="t">${catName(tx.type,tx.cat)}${tx.note?` · ${tx.note}`:''}</div></div>
    <div class="m-line2"><span class="s">${accName(tx.acc)}${typeTagHtml(tx.type)}</span><span class="amt2">${tx.amt<0&&!txSign(tx)?'−':''}${txSign(tx)}${abs(tx.amt)}</span></div>
  </div>`;
}
/* 统计条：当前筛选结果的口径（不随翻页变化） */
function txStats(list){
  const inS=list.filter(t=>t.type==='income'||t.type==='refund').reduce((s,t)=>s+t.amt,0);
  const outS=list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amt,0);
  return {n:list.length,in:inS,out:outS,net:inS-outS};
}
/* 评审轮 P3：页头「共 N 笔」与统计条同一口径 —— 跟随搜索 / 类型 / 高级筛选 */
const filteredCount=()=>{ const kw=S.search.trim().toLowerCase(); return TXNS.filter(t=>txPass(t,kw)).length; };
/* 分页条：PC 与移动端共用（按钮走 setTxPage） */
function txPager(total){
  const pages=Math.max(1,Math.ceil(total/S.txPageSize));
  if(S.txPage>pages) S.txPage=pages;
  if(pages<=1) return `<div class="pager"><span class="lbl">共 ${total} 笔</span></div>`;
  return `<div class="pager">
    <span class="lbl">共 ${total} 笔 · 第 ${S.txPage}/${pages} 页</span>
    <span class="pg-btns">
      <button class="btn btn-sm" ${S.txPage<=1?'disabled':''} onclick="setTxPage(${S.txPage-1})">上一页</button>
      <button class="btn btn-sm" ${S.txPage>=pages?'disabled':''} onclick="setTxPage(${S.txPage+1})">下一页</button>
    </span></div>`;
}
function txList(device){
  const kw=S.search.trim().toLowerCase();
  const list=TXNS.filter(t=>txPass(t,kw));
  if(!list.length) return stateBlock((kw||S.typeFilter||activeFilterCount())?'noresult':'empty');
  const st=txStats(list);
  const pages=Math.max(1,Math.ceil(list.length/S.txPageSize));
  if(S.txPage>pages) S.txPage=pages;
  const slice=list.slice((S.txPage-1)*S.txPageSize,S.txPage*S.txPageSize);
  const byDay={};
  slice.forEach(t=>{(byDay[t.date]=byDay[t.date]||[]).push(t)});
  const row=device==='m'?txRowM:txRowPc;
  const statBar=`<div class="stat-bar">
    <span class="sb-item"><span class="k">笔数</span><span class="v num">${st.n}</span></span>
    <span class="sb-item"><span class="k">收入</span><span class="v num">+${fmt(st.in)}</span></span>
    <span class="sb-item"><span class="k">支出</span><span class="v num">−${fmt(st.out)}</span></span>
    <span class="sb-item sb-main"><span class="k">净额</span><span class="v num">${st.net>=0?'+':'−'}${abs(st.net)}</span></span>
  </div>`;
  return statBar+`<div class="tx-list">`+Object.entries(byDay).map(([d,arr])=>{
    const sum=arr.reduce((s,t)=>s+txFlow(t),0);
    return `<div class="day-head"><span>${dCN(d)}</span><span class="sum">收支 ${sum>=0?'+':'−'}${abs(sum)}</span></div>`
      + arr.map(t=>row(t)).join('');
  }).join('')+`</div>`+txPager(list.length);
}

/* ================= 三态 ================= */
function stateBlock(state){
  if(state==='loading') return `<div class="state-wrap" role="status" aria-live="polite" aria-busy="true">
    <span class="sr-only">正在加载数据…</span>
    <div style="width:100%;max-width:520px;display:flex;flex-direction:column;gap:12px" aria-hidden="true">
      <div class="skel" style="height:52px"></div>
      ${'<div class="skel" style="height:64px"></div>'.repeat(4)}
      <div class="skel" style="height:120px"></div>
    </div></div>`;
  if(state==='empty') return `<div class="state-wrap">
    <div class="cat-ico" style="width:40px;height:40px">空</div><h2>从第一笔开始</h2>
    <p>账本是空白的。三步之后，这里会有你的第一份净资产与收支图。</p>
    <div class="checklist">
      <button class="check-item" onclick="go('settings')"><span class="n">1</span><span><span class="t">建一个账户</span><br><span class="s">现金、储蓄卡或信用卡</span></span></button>
      <button class="check-item" onclick="openEntry()"><span class="n">2</span><span><span class="t">记第一笔</span><br><span class="s">3 步内完成：金额 → 分类 → 保存</span></span></button>
      <button class="check-item" onclick="S.dataState='normal';render()"><span class="n">3</span><span><span class="t">看你的第一份报表</span><br><span class="s">收支、资产负债一目了然</span></span></button>
    </div></div>`;
  if(state==='noresult') return `<div class="state-wrap">
    <div class="cat-ico" style="width:40px;height:40px">无</div><h2>没有匹配的记录</h2>
    <p>当前筛选条件下没有流水。换一个关键词，或清空筛选再看全部记录。</p>
    <button class="btn primary" onclick="clearAllFilters()">清空筛选</button></div>`;
  if(state==='error') return `<div class="state-wrap" role="alert">
    <div class="cat-ico" style="width:40px;height:40px">错</div><h2>数据没取回来</h2>
    <p>本地数据库响应超时。你的数据没有丢失——这是展示层的问题。</p>
    <button class="btn primary" onclick="S.dataState='normal';render()">重试</button>
    <button class="link-btn" onclick="toast('错误码 E_DB_TIMEOUT 已复制（原型演示）')">复制错误码</button></div>`;
  return '';
}
const withState = html => S.dataState==='normal' ? html : stateBlock(S.dataState);

/* ================= 统计 ================= */
const flowTotals=()=>TXNS.reduce((a,t)=>{
  if(t.type==='income'||t.type==='refund') a.in+=t.amt;
  else if(t.type==='expense') a.out+=t.amt;
  else if(t.type==='adjustment') a.out+=Math.max(0,-t.amt);
  return a;
},{in:0,out:0});
const netWorth=()=>ACC.reduce((s,a)=>s+a.bal,0);
/* 报表口径按「账户分类」分组，而不是账户自己的一串 kind：
   现金等价 = 分类标记 cashEq；投资账户 = 分类标记 inv。 */
const liquidAssets=()=>ACC.filter(accIsCashEq).reduce((s,a)=>s+a.bal,0);
const investAssets=()=>ACC.filter(accIsInv).reduce((s,a)=>s+a.bal,0);
const assetAccounts=()=>ACC.filter(a=>accCat(a.cat).type==='asset');
const liabAccounts=()=>ACC.filter(a=>accCat(a.cat).type==='liability');

/* ================= 预算（预算条目 · 周期口径） ================= */
/* 一条预算的用量 = 该分类子树（对齐 budget.service.ts getCategoryWithDescendants）
   在该预算周期内、该预算账户下的交易额。周期不同，用量区间不同。
   评审轮（B2）：预算「已用」锚定当前日期（NOW_T，从 today 派生），不随报表所选
   期间漂移 —— 总览与预算页同源同值；报表的预测口径（forecastOf）仍按报表期间
   取预算覆盖范围（调用 budgetRange 不传第二参，走 S.repTime）。 */
const NOW_T=()=>({y:+today.slice(0,4),m:+today.slice(5,7),d:+today.slice(8,10)});
/* 本地日期串（不用 toISOString —— UTC+8 下本地午夜会折回前一天，周区间会少一天） */
const dStr=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
function budgetRange(b,t){
  const tt=t||S.repTime; const y=tt.y, m=tt.m;
  if(b.period==='weekly'){
    const end=new Date(y,m-1,tt.d);
    const start=new Date(end); start.setDate(end.getDate()-6);
    return [dStr(start), dStr(end)];
  }
  if(b.period==='yearly') return [`${y}-01-01`,`${y}-12-31`];
  if(b.period==='quarterly'){
    const q=Math.floor((m-1)/3)*3+1;
    const last=new Date(y,q+2,0).getDate();
    return [`${y}-${String(q).padStart(2,'0')}-01`,`${y}-${String(q).padStart(2,'0')}-${last}`];
  }
  const last=new Date(y,m,0).getDate();
  return [`${y}-${String(m).padStart(2,'0')}-01`,`${y}-${String(m).padStart(2,'0')}-${last}`];
}
const budgetUsed=b=>{
  const [from,to]=budgetRange(b,NOW_T());
  return TXNS.filter(t=>t.type===b.type&&catHit(t.cat,b.cat)
      &&(!b.acc||t.acc===b.acc||t.toAcc===b.acc)
      &&t.date>=from&&t.date<=to).reduce((s,t)=>s+t.amt,0);
};
const budgetRows=()=>BUDGETS.map(b=>{
  const used=budgetUsed(b);
  return {...b,used,over:used>b.amount,pct:b.amount?Math.round(used/b.amount*100):0};
});
const budgetTotal=(type='expense')=>{
  const rs=budgetRows().filter(b=>b.type===type);
  return {limit:rs.reduce((s,b)=>s+b.amount,0),used:rs.reduce((s,b)=>s+b.used,0),n:rs.length};
};
const budgetPeriodName=p=>(BUDGET_PERIODS.find(x=>x[0]===p)||[p,p])[1];

/* ================= 投资（快照链派生） ================= */
/* 快照按日期排序；prev 指针是链（对齐 InvestmentAllocationSnapshot.previousSnapshotId）。
   新增/编辑/删除后统一 relink，保证链不悬空。 */
const invSorted=()=>[...INV_SNAPSHOTS].sort((a,b)=>a.date<b.date?-1:1);
const invLatest=()=>invSorted()[invSorted().length-1];
const invPrevOf=id=>{const i=INV_SNAPSHOTS.findIndex(s=>s.id===id);return i>0?INV_SNAPSHOTS[i-1].id:null;};
const invTotalOf=s=>INV_CLASSES.reduce((sum,c)=>sum+(s.items[c.id]||0),0);
/* 删除/新增后重排 prev 指针：链上每个快照的 prev 指向它前一个快照 */
function relinkSnapshots(){
  const sorted=invSorted();
  sorted.forEach((s,i)=>{ s.prev = i>0?sorted[i-1].id:null; });
}
/* 期间收益：本期市值 − 上期市值 − 本期净流入 */
function invPeriodReturn(s){
  const prev=INV_SNAPSHOTS.find(x=>x.id===s.prev);
  if(!prev) return {val:null,rate:null};
  const val=invTotalOf(s)-invTotalOf(prev)-s.net;
  const base=invTotalOf(prev)+s.net;
  return {val,rate:base?val/base:null};
}
/* 累计收益：最新市值 − 累计净流入 − 期初市值 */
function invCumReturn(){
  const sorted=invSorted(); if(sorted.length<2) return {val:0,rate:0,in:0};
  const first=sorted[0], last=sorted[sorted.length-1];
  const inflow=sorted.slice(1).reduce((a,s)=>a+s.net,0);
  const val=invTotalOf(last)-invTotalOf(first)-inflow;
  const base=invTotalOf(first)+inflow;
  return {val,rate:base?val/base:0,in:base};
}
/* XIRR（对齐真实实现用 xirr 包）：现金流序列 + 每期时间间隔（年） */
function xirr(flows){
  // flows: [{t:年数, amt:金额}]，最后一期为终值
  const npv=r=>flows.reduce((s,f)=>s+f.amt/Math.pow(1+r,f.t),0);
  let lo=-0.9999, hi=10;
  if(npv(lo)*npv(hi)>0) return null;
  for(let i=0;i<200;i++){
    const mid=(lo+hi)/2;
    if(npv(lo)*npv(mid)<=0) hi=mid; else lo=mid;
  }
  return (lo+hi)/2;
}
function invXirr(){
  const sorted=invSorted(); if(sorted.length<2) return null;
  const t0=new Date(sorted[0].date).getTime();
  const flows=[{t:0,amt:-invTotalOf(sorted[0])}];
  sorted.slice(1).forEach(s=>{
    const t=(new Date(s.date).getTime()-t0)/(365*24*3600*1000);
    if(s.net) flows.push({t,amt:-s.net});
  });
  const last=sorted[sorted.length-1];
  const tl=(new Date(last.date).getTime()-t0)/(365*24*3600*1000);
  flows.push({t:tl,amt:invTotalOf(last)});
  return xirr(flows);
}
/* TWR：各期收益按期复利连乘，再年化 */
function invTwr(){
  const sorted=invSorted(); if(sorted.length<2) return null;
  let acc=1;
  for(let i=1;i<sorted.length;i++){
    const prev=sorted[i-1], cur=sorted[i];
    const base=invTotalOf(prev)+cur.net;
    if(!base) continue;
    acc*=(invTotalOf(cur)-cur.net)/base;
  }
  const years=(new Date(sorted[sorted.length-1].date)-new Date(sorted[0].date))/(365*24*3600*1000);
  return years>0?Math.pow(acc,1/years)-1:null;
}
/* 当前配置 vs 目标比例：偏差与再平衡金额（对齐 investment-analysis-calc.ts） */
function invAllocation(){
  const last=invLatest(); const total=invTotalOf(last);
  return INV_CLASSES.map(c=>{
    const cur=last.items[c.id]||0;
    const curRatio=total?cur/total:0;
    const dev=curRatio-c.target;
    return {id:c.id,name:c.name,cur,curRatio,target:c.target,dev,
      rebalance:Math.round((c.target*total-cur)*100)/100};
  });
}
/* 投资费用：投资账户下的交易费用合计（手续费 + 优惠券） */
const invFees=()=>TXNS.filter(t=>accIsInv(ACC.find(a=>a.id===t.acc)||{})||accIsInv(ACC.find(a=>a.id===t.toAcc)||{}))
  .reduce((s,t)=>s+(t.fee||0),0);
/* 投资组合期末口径：各投资账户最新快照的市值合计 */
const invLatestTotal=()=>invAccountRows().reduce((s,r)=>s+r.total,0);
/* 期间投入（净流入累计，负数表示取出） */
const invInflowTotal=()=>invSorted().slice(1).reduce((s,x)=>s+x.net,0);
/* 投资占总资产比 */
const invWeight=()=>{ const ta=assetAccounts().reduce((s,a)=>s+a.bal,0); return ta?invLatestTotal()/ta:0; };
/* 逐期序列：趋势占位与快照表共用 */
const invPeriods=()=>invSorted().map(s=>({id:s.id,date:s.date,total:invTotalOf(s),net:s.net,ret:invPeriodReturn(s)}));
/* 投资账户明细树：账户 → 资产类别（快照口径的期末市值） */
function invAccountRows(){
  const ids=[...new Set(invSorted().map(s=>s.acc))];
  return ids.map(aid=>{
    const snaps=invSorted().filter(s=>s.acc===aid);
    const last=snaps[snaps.length-1];
    const acc=ACC.find(a=>a.id===aid);
    return {acc, cat:acc?accCat(acc.cat):null, total:invTotalOf(last), n:snaps.length,
      detail:INV_CLASSES.map(c=>({cls:c, amt:last.items[c.id]||0}))};
  });
}
/* 期间投入 / 取出分解：投入 = 正数，取出 = 负数绝对值 */
const invIn=()=>invSorted().slice(1).reduce((s,x)=>s+(x.net>0?x.net:0),0);
const invOut=()=>invSorted().slice(1).reduce((s,x)=>s+(x.net<0?-x.net:0),0);

/* 分类聚合：报表的构成表与下钻共用。返回二级树，父行金额 = 自身 + 子分类
   退款 / 对账调整按 catType 归入收入 / 支出两棵树（O3）。 */
function groupByCat(type){
  const tree=catType(type);
  const own={};
  TXNS.filter(t=>catType(t.type)===tree).forEach(t=>{(own[t.cat]=own[t.cat]||{amt:0,n:0}).amt+=t.amt; own[t.cat].n++;});
  const kidsOf=cat=>(CATS[tree]||[]).filter(c=>c[2]===cat).map(c=>c[0]).filter(cid=>own[cid]);
  const node=cat=>{
    const kids=kidsOf(cat).map(node).sort((a,b)=>b.amt-a.amt);
    const o=own[cat]||{amt:0,n:0};
    return {cat, amt:o.amt+kids.reduce((s,k)=>s+k.amt,0), n:o.n+kids.reduce((s,k)=>s+k.n,0), children:kids};
  };
  const roots=(CATS[tree]||[]).filter(c=>!c[2]).map(c=>c[0])
    .filter(cid=>own[cid]||kidsOf(cid).length).map(node);
  const total=roots.reduce((s,r)=>s+r.amt,0)||1;
  const walk=n=>{ n.share=n.amt/total; n.children.forEach(c=>{ c.share=c.amt/(n.amt||1); walk(c); }); };
  roots.sort((a,b)=>b.amt-a.amt).forEach(walk);
  return roots;
}
/* 现金流分类聚合（M6）：按分类的现金流属性分四组。
   转账是账户间资金移动，不产生现金流，故不计入四类。 */
function cashFlowRows(){
  return CF_VALUES.map(v=>{
    const list=TXNS.filter(t=>cfOf(t.cat)===v);
    const inS=list.filter(t=>t.type==='income'||t.type==='refund').reduce((s,t)=>s+t.amt,0);
    const outS=list.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amt,0);
    return {v,in:inS,out:outS,net:inS-outS,n:list.length};
  });
}
/* 折叠键：报表与下钻共用 S.folded */
const foldKey = (type,cat) => `${type}:${cat}`;
const isFolded = (type,cat) => S.folded.has(foldKey(type,cat));
/* 用户第三轮：现金流不设独立分类表 —— 经营 / 投资 / 筹资 / 未分类作为一级分组
   直接进入流入（收入+退款）/ 流出（支出+转账）表；转账单列「账户间转账」组，
   不计入三类净额。分组行可折叠，复用 S.folded / toggleFold（与二级分类同构）。 */
const cashGroupOf = t => t.type==='transfer' ? '账户间转账' : cfOf(t.cat);
const CASH_GROUP_ORDER = ['经营','投资','筹资','未分类','账户间转账'];
function cashFlowTable(dir,device){
  const list = dir==='in'
    ? TXNS.filter(t=>t.type==='income'||t.type==='refund')
    : [...TXNS.filter(t=>t.type==='expense'),...TXNS.filter(t=>t.type==='transfer')];
  const groups=CASH_GROUP_ORDER.filter(g=>list.some(t=>cashGroupOf(t)===g));
  const rows=[];
  groups.forEach(g=>{
    const kids=list.filter(t=>cashGroupOf(t)===g);
    const key=`cash${dir}:${g}`;
    const folded=S.folded.has(key);
    const total=kids.reduce((s,t)=>s+t.amt,0);
    rows.push(device==='pc'
      ? {cells:[g,kids.length+' 笔',fmt(total)],level:0,foldKey:key,folded}
      : {cells:[g,fmt(total)],level:0,foldKey:key,folded});
    if(!folded) kids.forEach(t=>rows.push(device==='pc'
      ? {cells:[`└ ${catName(t.type,t.cat)}${t.note?' · '+t.note:''}`,accName(t.acc),fmt(t.amt)],level:1}
      : {cells:[`└ ${t.note||catName(t.type,t.cat)} · ${accName(t.acc)}`,fmt(t.amt)],level:1}));
  });
  const sum=list.reduce((s,t)=>s+t.amt,0);
  return device==='pc'
    ? invTable(['现金流分类 / 交易','账户','金额'],rows,{total:['合计','—',fmt(sum)]})
    : invTable(['现金流分类 / 交易','金额'],rows,{total:['合计',fmt(sum)]});
}
/* 摊平成表格行：level 0 = 父级（可折叠），level 1 = 子级（缩进） */
function catRows(type){
  const out=[];
  groupByCat(type).forEach(p=>{
    const folded=isFolded(type,p.cat);
    out.push({cat:p.cat,name:catName(type,p.cat),level:0,amt:p.amt,n:p.n,share:p.share,
      hasKids:p.children.length>0,folded});
    if(p.children.length && !folded)
      p.children.forEach(c=>out.push({cat:c.cat,name:catName(type,c.cat),level:1,amt:c.amt,n:c.n,share:c.share,parent:p.cat}));
  });
  return out;
}
/* 表尾合计口径：按当前可见层级（父级）汇总 —— 父级金额已含其子分类，
   所以折叠不改变合计；口径写进表下说明，避免「折叠了但合计没变」的疑问。 */
function catRowsTotal(type){
  return catRows(type).filter(r=>r.level===0).reduce((s,r)=>s+r.amt,0);
}

/* ================= 视图 · 总览 ================= */
/* 用户第三轮：账户明细移出总览主区（余额是配置态数据，总览读趋势与动向）。
   主区改为净资产走势占位图；账户收成一行入口（.acct-entry，点击进设置）。 */
function viewDash(device){
  const f=flowTotals(), nw=netWorth(), liq=liquidAssets();
  const saveRate=f.in?((f.in-f.out)/f.in*100).toFixed(1):'0.0';
  if(device==='m'){
    /* 第四轮间距栅格：卡片纵向堆叠统一走 .page-stack 的 gap（12px），不再逐个写 margin */
    return withState(`
    <div class="m-head"><h1>总览</h1><div class="m-head-acts">
      <button class="icon-btn" onclick="go('txns')" aria-label="搜索">${I.search}</button>
      <button class="icon-btn" onclick="go('settings')" aria-label="设置">${I.set}</button></div></div>
    <div class="page-stack">
    <div class="m-hero">
      <div class="label">净 资 产</div>
      <div class="worth num">¥ ${fmt(nw)}</div>
      <div class="sub">10 月已过 28 天 · 现金等价 ¥ ${fmt(liq)}</div>
    </div>
    <div class="m-quick">
      <div class="card"><div class="k">本月收入</div><div class="v num">+${fmt(f.in)}</div><div class="trend">▲ 较上月 +8.2%</div></div>
      <div class="card"><div class="k">本月支出</div><div class="v num">−${fmt(f.out)}</div><div class="trend trend-down">▲ 较上月 +3.1%</div></div>
    </div>
    <button class="acct-entry" onclick="go('settings')">账户与余额 · ${ACC.length} 个账户 · 现金等价 ¥${fmt(liq)} <span class="set-chev">›</span></button>
    <div class="card card-pad">
      <h3 style="margin-bottom:8px">净资产走势</h3>
      <div class="fig" style="height:150px"><div class="t">近 12 个月（占位）</div><div class="s">线框级不画真实图表 · 高保真阶段替换为真实曲线</div></div>
    </div>
    <div class="card card-pad">
      <h3 style="margin-bottom:8px">预算进度</h3>
      ${budgetRows().filter(b=>b.type==='expense').slice(0,3).map(b=>budRowM(b)).join('')}
      <button class="acct-more" onclick="go('budgets')">查看全部预算 <span class="set-chev">›</span></button>
    </div>
    <div class="card card-pad">
      <h3 style="margin-bottom:8px">最近流水</h3>
      ${TXNS.slice(0,4).map(t=>recentRowM(t)).join('')}
      <button class="acct-more" onclick="go('txns')">查看全部流水 <span class="set-chev">›</span></button>
    </div>
    </div>`);
  }
  return withState(`
  <div class="page-head"><h1>总览</h1><span class="desc">2026 年 10 月 · 数据截至 10-28</span></div>
  <div class="page-stack">
  <div class="hero">
    <div class="label">净资产</div>
    <div class="worth num">¥ ${fmt(nw)}</div>
    <div class="delta">现金等价 ¥ ${fmt(liq)} · 投资账户 ¥ ${fmt(investAssets())} · 10 月已过 28 天</div>
    <div class="hero-grid">
      <div class="cell"><div class="k">本月收入</div><div class="v num">+${fmt(f.in)}</div><div class="trend">▲ 较上月 +8.2%</div></div>
      <div class="cell"><div class="k">本月支出</div><div class="v num">−${fmt(f.out)}</div><div class="trend trend-down">▲ 较上月 +3.1%</div></div>
      <div class="cell"><div class="k">本月结余</div><div class="v num">${f.in-f.out>=0?'+':'−'}${abs(f.in-f.out)}</div></div>
      <div class="cell"><div class="k">储蓄率</div><div class="v num">${saveRate}%</div></div>
    </div>
  </div>
  <button class="acct-entry" onclick="go('settings')">账户与余额 · ${ACC.length} 个账户 · 现金等价 ¥${fmt(liq)} / 投资 ¥${fmt(investAssets())} <span class="set-chev">›</span></button>
  <div class="dash-mid">
    <div class="card card-pad">
      <div class="sec-head"><h3>最近交易</h3><span class="sec-sub">最新 3 笔 · 点击查看详情</span></div>
      ${TXNS.slice(0,3).map(t=>recentRowPc(t)).join('')}
      <button class="acct-more" onclick="go('txns')">查看全部流水 <span class="set-chev">›</span></button>
    </div>
    <div class="card card-pad">
      <div class="sec-head"><h3>本月预算</h3><span class="sec-sub">${budgetTotal('expense').limit>0?Math.round(budgetTotal('expense').used/budgetTotal('expense').limit*100):0}% 已用</span></div>
      ${budgetRows().filter(b=>b.type==='expense').slice(0,4).map(b=>budRowPc(b)).join('')}
      <button class="acct-more" onclick="go('budgets')">查看全部预算 <span class="set-chev">›</span></button>
    </div>
  </div>
  <div class="card card-pad">
    <div class="sec-head"><h3>净资产走势</h3><span class="sec-sub">近 12 个月 · 占位</span></div>
    <div class="fig" style="height:200px"><div class="t">净资产趋势（占位）</div><div class="s">线框级不画真实图表 · 高保真阶段替换为真实曲线</div></div>
  </div>
  </div>`);
}
const acctRowPc = a => `<div class="acct-row"><span class="acct-ico">${glyph(a.name)}</span>
  <div class="meta"><div class="t">${a.name}</div><div class="s">${accKind(a)}</div></div>
  <div class="amt num">${fmt(a.bal)}</div></div>`;
const acctRowM = a => `<div class="acct-row"><span class="acct-ico">${glyph(a.name)}</span>
  <div class="meta"><div class="t">${a.name}</div><div class="s">${accKind(a)}</div></div>
  <div class="amt num">${fmt(a.bal)}</div></div>`;
/* 总览「最近交易」行（两端同构）：与真实 Dashboard 的最近交易卡对齐——
   点行跳流水页，不在此开详情；移动端只列 4 笔（UX3 §3）、PC 列 3 笔 */
const recentRowPc = t => `<div class="acct-row" style="cursor:pointer" onclick="go('txns')">
  <span class="cat-ico">${catGlyph(catName(t.type,t.cat))}</span>
  <div class="meta"><div class="t">${catName(t.type,t.cat)}${t.note?' · '+t.note:''}</div>
  <div class="s">${t.date.slice(5)} · ${accName(t.acc)} · ${TYPE_CN[t.type]}</div></div>
  <div class="amt num">${txSign(t)}${abs(t.amt)}</div></div>`;
const recentRowM = t => `<div class="acct-row" style="cursor:pointer" onclick="go('txns')">
  <span class="cat-ico">${catGlyph(catName(t.type,t.cat))}</span>
  <div class="meta"><div class="t">${catName(t.type,t.cat)}${t.note?' · '+t.note:''}</div>
  <div class="s">${t.date.slice(5)} · ${accName(t.acc)} · ${TYPE_CN[t.type]}</div></div>
  <div class="amt num">${txSign(t)}${abs(t.amt)}</div></div>`;
/* 预算行：名称 + 周期 + 分类 + 账户，用量按该预算自身周期区间算 */
const budRowPc = b => `<div class="b-row" onclick="openBudget('${b.id}')" style="cursor:pointer">
  <div class="nm"><span class="n1">${b.name}${b.over?'<span class="over-flag">超支</span>':''}<span class="tag">${budgetPeriodName(b.period)}</span></span>
    <span class="n2">${catLabel(b.type,b.cat)}${b.acc?' · '+accName(b.acc):''}</span></div>
  <div class="track"><div class="fill" style="width:${Math.min(100,b.pct)}%"></div></div>
  <div class="v num">${fmt(b.used)} / ${fmt(b.amount)}</div></div>`;
const budRowM = b => `<div class="m-trow" onclick="openBudget('${b.id}')">
  <div class="t-row"><span>${b.name}${b.over?'<span class="over-flag">超支</span>':''}<span class="tag">${budgetPeriodName(b.period)}</span></span>
  <span class="num" style="font-size:var(--mb-fs-1)">${fmt(b.used)} / ${fmt(b.amount)}</span></div>
  <div class="track"><div class="fill" style="width:${Math.min(100,b.pct)}%"></div></div>
  <div class="lbl" style="margin-top:4px">${catLabel(b.type,b.cat)}${b.acc?' · '+accName(b.acc):''}</div></div>`;

/* ================= 视图 · 流水 ================= */
const TYPE_TABS=[['全部',undefined],['支出','expense'],['收入','income'],['转账','transfer'],['退款','refund'],['调整','adjustment']];
function viewTxns(device){
  if(device==='m'){
    return withState(`
    <div class="m-head"><h1>流水</h1><div class="m-head-acts">
      <button class="btn btn-sm" onclick="openFilter()">高级筛选</button>
      <button class="btn btn-sm" onclick="openOverlay('setsec',{sec:'列表显示'})" title="列显示与密度（与 PC ⚙ 显示同一面板）">显示</button>
      <button class="btn btn-sm ${S.batch?'on':''}" onclick="toggleBatch()">${S.batch?'退出批量':'批量'}</button>
    </div></div>
    <div class="m-search">${I.search}<input placeholder="搜索备注、账户、分类…" value="${S.search}" oninput="onSearch(this.value)"></div>
    <div class="seg-row" style="margin-bottom:8px">
      ${TYPE_TABS.slice(0,4).map(([l,v])=>`<button class="${S.typeFilter===v?'on':''}" onclick="setTypeFilter(${v?`'${v}'`:'undefined'})">${l}</button>`).join('')}
    </div>
    <div id="activeFilterBarM">${activeFilterBar()}</div>
    <div id="txListM">${txList('m')}</div>`);
  }
  return withState(`
  <div class="page-head"><h1>流水</h1><span class="desc">共 <span id="txnCountPc">${filteredCount()}</span> 笔</span></div>
  <div class="tx-toolbar">
    <div class="search">${I.search}<input placeholder="搜索备注、账户、分类…" value="${S.search}" oninput="onSearch(this.value)"></div>
    <div class="seg-row">
      ${TYPE_TABS.map(([l,v])=>`<button class="${S.typeFilter===v?'on':''}" onclick="setTypeFilter(${v?`'${v}'`:'undefined'})">${l}</button>`).join('')}
    </div>
    <button class="btn btn-sm" onclick="toggleFilter()">⌄ 高级筛选${activeFilterCount()?` <span class="filter-count">${activeFilterCount()}</span>`:''}</button>
    <button class="btn btn-sm ${S.batch?'on':''}" onclick="toggleBatch()">${S.batch?'退出批量':'☑ 批量'}</button>
    <button class="btn btn-sm" onclick="openOverlay('setsec',{sec:'列表显示'})" title="列显示与密度（原地打开，设置页同名分区为权威入口）">⚙ 显示</button>
  </div>
  ${S.filterOpen?filterPanelPc():''}
  <div id="activeFilterBarPc">${activeFilterBar()}</div>
  <div id="txListPc">${txList('pc')}</div>`);
}
function activeFilterBar(){
  const f=S.filters, chips=[];
  if(S.typeFilter) chips.push(`<span class="af-chip">${TYPE_CN[S.typeFilter]} <button onclick="setTypeFilter(undefined)" aria-label="清除类型条件">✕</button></span>`);
  if(f.cat) chips.push(`<span class="af-chip">${catLabel('expense',f.cat)} <button onclick="setFilter('cat','')" aria-label="清除分类条件">✕</button></span>`);
  if(f.acc) chips.push(`<span class="af-chip">${accName(f.acc)} <button onclick="setFilter('acc','')" aria-label="清除账户条件">✕</button></span>`);
  if(f.min) chips.push(`<span class="af-chip">≥ ${f.min} <button onclick="setFilter('min','')" aria-label="清除金额下限">✕</button></span>`);
  if(f.max) chips.push(`<span class="af-chip">≤ ${f.max} <button onclick="setFilter('max','')" aria-label="清除金额上限">✕</button></span>`);
  if(f.from) chips.push(`<span class="af-chip">≥ ${f.from} <button onclick="setFilter('from','')" aria-label="清除起始日期">✕</button></span>`);
  if(f.to) chips.push(`<span class="af-chip">≤ ${f.to} <button onclick="setFilter('to','')" aria-label="清除截止日期">✕</button></span>`);
  if(!chips.length) return '';
  return `<div class="active-filters">${chips.join('')}<button class="af-clear" onclick="clearAllFilters()">清除条件</button></div>`;
}
function filterPanelPc(){
  const f=S.filters;
  return `<div class="filter-panel">
    <div class="filter-grid">
      <div class="field"><label>账户</label><select onchange="setFilter('acc',this.value)">
        <option value="">全部</option>${ACC.map(a=>`<option value="${a.id}" ${f.acc===a.id?'selected':''}>${a.name}</option>`).join('')}</select></div>
      <div class="field"><label>分类</label><select onchange="setFilter('cat',this.value)">
        <option value="">全部</option>${catOptions('expense').map(o=>`<option value="${o.v}" ${f.cat===o.v?'selected':''}>${o.level?'　'+o.label:o.label}</option>`).join('')}</select></div>
      <div class="field"><label>金额范围</label>
        <div style="display:flex;gap:8px"><input placeholder="最小" value="${f.min}" oninput="setFilter('min',this.value)"><input placeholder="最大" value="${f.max}" oninput="setFilter('max',this.value)"></div></div>
      <div class="field"><label>起始日期</label><input type="date" value="${f.from}" onchange="setFilter('from',this.value)"></div>
      <div class="field"><label>截止日期</label><input type="date" value="${f.to}" onchange="setFilter('to',this.value)"></div>
    </div>
    <div class="filter-actions"><button class="btn ghost btn-sm" onclick="resetFilters()">重置</button><button class="btn primary btn-sm" onclick="toggleFilter()">收起</button></div>
  </div>`;
}
/* 移动端高级筛选走抽屉（与时间选择同一手势） */
function filterPanelM(){
  const f=S.filters;
  return `<div class="d-sec">账户</div>
  <div class="field"><select onchange="setFilter('acc',this.value)"><option value="">全部</option>${ACC.map(a=>`<option value="${a.id}" ${f.acc===a.id?'selected':''}>${a.name}</option>`).join('')}</select></div>
  <div class="d-sec">分类</div>
  <div class="field"><select onchange="setFilter('cat',this.value)"><option value="">全部</option>${catOptions('expense').map(o=>`<option value="${o.v}" ${f.cat===o.v?'selected':''}>${o.level?'　'+o.label:o.label}</option>`).join('')}</select></div>
  <div class="d-sec">金额范围</div>
  <div class="field"><div style="display:flex;gap:8px"><input placeholder="最小" value="${f.min}" oninput="setFilter('min',this.value)"><input placeholder="最大" value="${f.max}" oninput="setFilter('max',this.value)"></div></div>
  <div class="d-sec">日期范围</div>
  <div class="field"><div style="display:flex;gap:8px"><input type="date" value="${f.from}" onchange="setFilter('from',this.value)"><input type="date" value="${f.to}" onchange="setFilter('to',this.value)"></div></div>
  <div class="filter-actions"><button class="btn ghost btn-sm" onclick="resetFilters()">重置</button><button class="btn primary btn-sm" onclick="closeOverlay()">应用</button></div>`;
}

/* ================= 视图 · 报表 ================= */
const REP_TABS=[['balance','资产负债'],['flow','收支'],['cash','现金流'],['invest','投资']];
/* O5：报表视图可自定义（隐藏不用的 tab）。默认全开；至少保留一个视图。 */
const repViews=()=>S.repViews&&S.repViews.length?S.repViews:REP_TABS.map(r=>r[0]);
const repTabLabel=k=>(REP_TABS.find(r=>r[0]===k)||[k,k])[1];
/* Q7 已拍板：报表不保留「一句话结论」。PC 指标条与移动端结论块都不再渲染，
   结论改由「指标 + 表格 + 表尾合计」自己读出来。 */
/* S9：所选期间晚于最后一个有数据的月份时，该期间是「预测」而不是「实际」。
   预测口径 = 同类型预算条目（周期覆盖该月）的金额合计。
   实际 vs 预测在时间条上有显式标签，表头也写明「预测」，不混在同一张表里。 */
const DATA_LAST={y:2026,m:10};
const isFuturePeriod=()=>S.repTime.y>DATA_LAST.y||(S.repTime.y===DATA_LAST.y&&S.repTime.m>DATA_LAST.m);
/* 该月覆盖的预算条目金额合计（用于预测） */
function forecastOf(type){
  const t=S.repTime;
  return budgetRows().filter(b=>b.type===type&&budgetRange(b)[0]<=`${t.y}-${String(t.m).padStart(2,'0')}-01`
    &&budgetRange(b)[1]>=`${t.y}-${String(t.m).padStart(2,'0')}-${new Date(t.y,t.m,0).getDate()}`)
    .reduce((s,b)=>s+b.amount,0);
}
/* ===================== 时间选择核心（第十四轮重写 · 第十五轮粒度外置） =====================
   规范（唯一权威 = concept-design.md W6 规范表）：
   · 语义二分：balance=时点（余额快照）/ 其余=期间（发生额）。语义只决定面板里有没有「起止」，
     不产生任何文案差异（时间条不写「时点/期间」字样）。
   · 粒度三分 day/month/year，四张报表 × 两种语义都允许全部三档；
     时点：月=该月末、年=该年 12-31 锚定；期间：粒度=聚合桶。
   · 预设 × 粒度不兼容 → 置灰（面板内唯一规则）；时间条上切粒度后已生效预设若失效 → 吸附一次并 toast。
   · 粒度归属（第十五轮维度 9）：粒度 = 常驻控件，归属时间条（分段即改即生效）；
     面板只负责取值——打开 → 选预设（即时生效）或 自定义起止两步 → 应用；取消丢弃草稿。 */
const GRAN_CN={day:'日',month:'月',year:'年'};
const isPointReport=()=>S.repTab==='balance';
const PRESET_GRAN_OK={today:['day'],'7d':['day'],thism:['day','month'],prevm:['day','month'],
  quarter:['day','month'],thisy:['day','month','year'],'12m':['day','month','year']};
const presetOkForGran=k=>(PRESET_GRAN_OK[k]||['day']).includes(S.timeGran);
const rangeOkForGran=r=>{
  const days=(new Date(r.to)-new Date(r.from))/864e5;
  return S.timeGran==='year'?days>=360:S.timeGran==='month'?days>=28:true;
};
const PRESET_NAME_CN={today:'今天','7d':'近 7 天',thism:'本月',prevm:'上月',quarter:'本季',thisy:'今年','12m':'近 12 个月'};
const [TY,TM,TD]=today.split('-').map(Number);
const d2s=t=>`${t.y}-${String(t.m).padStart(2,'0')}-${String(t.d).padStart(2,'0')}`;
const s2d=s=>({y:+s.slice(0,4),m:+s.slice(5,7),d:+s.slice(8,10)});
/* 时点末日锚定：day=当日 / month=该月最后一天 / year=12-31（规则只写文档） */
function snapPointToGran(t){
  if(S.timeGran==='year') return {y:t.y,m:12,d:31};
  if(S.timeGran==='month') return {y:t.y,m:t.m,d:new Date(t.y,t.m,0).getDate()};
  return t;
}
const PRESET_RANGE={
  today:()=>[today,today],
  '7d':()=>{const e=s2d(today),f=new Date(e.y,e.m-1,e.d);f.setDate(f.getDate()-6);return [d2s({y:f.getFullYear(),m:f.getMonth()+1,d:f.getDate()}),today];},
  thism:()=>[`${TY}-${String(TM).padStart(2,'0')}-01`,`${TY}-${String(TM).padStart(2,'0')}-${new Date(TY,TM,0).getDate()}`],
  prevm:()=>{const y=TM===1?TY-1:TY,m=TM===1?12:TM-1;return [`${y}-${String(m).padStart(2,'0')}-01`,`${y}-${String(m).padStart(2,'0')}-${new Date(y,m,0).getDate()}`];},
  quarter:()=>{const q=Math.floor((TM-1)/3)*3+1,y=TY;return [`${y}-${String(q).padStart(2,'0')}-01`,`${y}-${String(q+2).padStart(2,'0')}-${new Date(y,q+2,0).getDate()}`];},
  thisy:()=>[`${TY}-01-01`,`${TY}-12-31`],
  '12m':()=>{const e=s2d(today),f=new Date(e.y,e.m-1,e.d);f.setMonth(f.getMonth()-11);return [d2s({y:f.getFullYear(),m:f.getMonth()+1,d:1}),today];},
};
/* ---------------- 面板草稿：打开时从已生效值初始化 ---------------- */
function openTimePanel(){
  S.timeDraft = isPointReport()
    ? {from:d2s(S.repTime), to:null, end:'from'}
    : {from:S.repRange?S.repRange.from:d2s(S.repTime), to:S.repRange?S.repRange.to:null, end:'from'};
}
function closeTimePanel(cancel){
  if(cancel) S.timeDraft=null;
  S.periodPop=false;
  if(S.overlay==='period') closeOverlay(); else render();
}
function applyTimeDraft(){
  const d=S.timeDraft||{};
  if(isPointReport()){
    if(!d.from){ toast('先选一个日期','提示'); return; }
    S.repTime=snapPointToGran(s2d(d.from)); S.repLabel=null; S.repRange=null;
  }else{
    if(!d.from||!d.to){ toast('先选「起」与「止」两个端点','提示'); return; }
    if(d.from>d.to){ toast('「起」需早于或等于「止」','提示'); return; }
    if(!rangeOkForGran({from:d.from,to:d.to})){ toast(`按${GRAN_CN[S.timeGran]}粒度的期间需不短于一个${GRAN_CN[S.timeGran]}`,'提示'); return; }
    S.repRange={from:d.from,to:d.to}; S.repLabel=null; S.repTime=s2d(d.from);
  }
  S.timeDraft=null; S.periodPop=false;
  if(S.overlay==='period') closeOverlay(); else render();
}
/* 预设：即时生效（写已生效值并关面板），不经过草稿 */
function pickTimePreset(k){
  const [f,t]=PRESET_RANGE[k]();
  S.repLabel=PRESET_NAME_CN[k]; S.repRange=null; S.timeDraft=null; S.periodPop=false;
  S.repTime=snapPointToGran(s2d(t));
  if(S.overlay==='period') closeOverlay(); else render();
}
function setTimeGran(g){
  if(S.timeGran===g) return;
  S.timeGran=g;
  const bad=!isPointReport()&&((S.repRange&&!rangeOkForGran(S.repRange))||(S.repLabel&&!presetOkForGran(S.repLabel)));
  if(bad){
    const snap=g==='year'?'thisy':(g==='month'?'thism':'today');
    S.repLabel=PRESET_NAME_CN[snap]; S.repRange=null; S.repTime=snapPointToGran(s2d(PRESET_RANGE[snap]()[1]));
    toast(`已切换为「${S.repLabel}」`,'提示');
  }
  if(isPointReport()) S.repTime=snapPointToGran(S.repTime);
  /* 粒度已外置时间条：面板开着时切粒度，草稿从（可能已吸附的）新已生效值重新初始化 */
  if(S.periodPop||S.overlay==='period') openTimePanel();
  render();
}
/* ---------------- 时间条（只显示所选值本身） ---------------- */
function timeLabelText(){
  if(isPointReport()) return d2s(S.repTime);
  if(S.repRange) return `${S.repRange.from} ~ ${S.repRange.to}`;
  if(S.repLabel) return S.repLabel;
  const t=S.repTime,g=S.timeGran;
  if(g==='year') return `${t.y}`;
  if(g==='month') return `${t.y}-${String(t.m).padStart(2,'0')}`;
  return d2s(t);
}
/* ---------------- 时间条（只显示所选值本身；粒度分段常驻——第十五轮维度 9） ----------------
   结构固定：‹ 左箭头 · 当前值（只读触发器，点开面板）· 右箭头 › · 粒度分段（日/月/年）。
   箭头按粒度步进（日 ±1 天 / 月 ±1 月 / 年 ±1 年）即改即生效；时点步进后仍锚月末/年末。
   粒度切换在时间条上直接完成（即改即生效 + 重锚定/吸附），不打开面板。 */
const GRAN_SHORT=[['day','日'],['month','月'],['year','年']];
function tbGranSeg(){
  return `<div class="tb-gran" role="group" aria-label="粒度">${GRAN_SHORT.map(([k,l])=>
    `<button class="${S.timeGran===k?'on':''}" onclick="setTimeGran('${k}')" aria-pressed="${S.timeGran===k}">${l}</button>`).join('')}</div>`;
}
function timeBar(device){
  const label=timeLabelText();
  const open=S.periodPop||S.overlay==='period';
  return `<div class="rep-timebar">
    <button class="tb-arrow" onclick="shiftTime(-1)" aria-label="上一期">‹</button>
    <button class="tb-trigger" onclick="${S.device==='pc'?'toggleTimePanel()':'openTimeDrawer()'}" aria-expanded="${open?'true':'false'}">${label} ▾</button>
    <button class="tb-arrow" onclick="shiftTime(1)" aria-label="下一期">›</button>
    ${tbGranSeg()}
    ${S.device==='pc'&&S.periodPop&&device==='pc'?periodPopPc():''}
  </div>`;
}
function toggleTimePanel(){
  if(S.periodPop){ closeTimePanel(true); return; }
  openTimePanel(); S.periodPop=true; render();
}
function openTimeDrawer(){ openTimePanel(); openOverlay('period'); }

/* 第八轮：报表工具栏「设置」→ 原地打开该报表对应的配置弹窗（对齐 apps/web：
   BalanceSheet→账户分类配置、IncomeExpense→交易分类配置、CashFlow→现金流配置、
   Investment→投资资产类型配置）；设置页「配置中心」打开同一批弹窗——多入口一份数据 */
const REP_CFG={balance:'acctcfg',flow:'catcfg',cash:'cfcfg',invest:'invtarget'};
function viewReports(device){
  const tab=S.repTab;
  const views=repViews();
  const tabsHtml=`<div class="tabs">${REP_TABS.filter(([k])=>views.includes(k)).map(([k,l])=>`<button class="tab ${tab===k?'on':''}" onclick="setRepTab('${k}')">${l}</button>`).join('')}
    <button class="tab" onclick="openOverlay('${REP_CFG[tab]}')" aria-label="打开本报表的配置弹窗">⚙ 设置</button></div>`;
  if(device==='m'){
    const tabsM=`<div class="seg-row" style="margin-bottom:8px">${REP_TABS.filter(([k])=>views.includes(k)).map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="setRepTab('${k}')">${l}</button>`).join('')}</div>`;
    return withState(`
    <div class="m-head"><h1>报表</h1><div class="m-head-acts"><button class="btn btn-sm" onclick="openOverlay('${REP_CFG[tab]}')">设置</button></div></div>
    ${tabsM}
    ${timeBar(device)}
    ${reportM(tab)}`);
  }
  return withState(`
  <div class="page-head"><h1>报表</h1><span class="desc">口径：含全部账户 · 未计入费用型账户</span></div>
  ${tabsHtml}
  ${timeBar(device)}
  ${reportPc(tab)}`);
}
/* O5：报表视图自定义（隐藏用不到的 tab）。至少保留一个视图。
   配置入口在 设置›列表显示（setsec 原地面板同渲染器，多入口一数据源）。 */
function toggleRepView(k,on){
  const cur=[...repViews()];
  const next=on?(cur.includes(k)?cur:[...cur,k]):cur.filter(x=>x!==k);
  if(!next.length){ toast('至少保留一个报表视图','提示'); render(); return; }
  S.repViews=next;
  if(!S.repViews.includes(S.repTab)) S.repTab=S.repViews[0];
  render();
}
function metricStrip(tab){
  const f=flowTotals();
  if(tab==='balance'){
    const asset=ACC.filter(a=>a.bal>0).reduce((s,a)=>s+a.bal,0), liab=Math.abs(ACC.find(a=>a.bal<0).bal);
    return `<div class="metric-strip">
      <div class="m-cell m-main"><div class="k">净资产</div><div class="v num">¥${fmt(netWorth())}</div><div class="m-note">资产 − 负债</div></div>
      <div class="m-cell"><div class="k">总资产</div><div class="v num">¥${fmt(asset)}</div></div>
      <div class="m-cell"><div class="k">总负债</div><div class="v num">¥${fmt(liab)}</div></div>
      <div class="m-cell"><div class="k">流动资产</div><div class="v num">¥${fmt(liquidAssets())}</div></div>
    </div>`;
  }
  if(tab==='flow'){
    /* S9：预测期间不显示「实际」口径，改显示按预算推算的预测值，标签写明「预测」 */
    if(isFuturePeriod()){
      const fi=forecastOf('income'), fo=forecastOf('expense');
      return `<div class="metric-strip">
        <div class="m-cell m-main"><div class="k">预测结余</div><div class="v num">${fi-fo>=0?'+':'−'}¥${abs(fi-fo)}</div><div class="m-note">预测 · 按预算推算</div></div>
        <div class="m-cell"><div class="k">预测收入</div><div class="v num">+¥${fmt(fi)}</div></div>
        <div class="m-cell"><div class="k">预测支出</div><div class="v num">−¥${fmt(fo)}</div></div>
        <div class="m-cell"><div class="k">预测储蓄率</div><div class="v num">${fi?((fi-fo)/fi*100).toFixed(1):'0.0'}%</div></div>
      </div>`;
    }
    return `<div class="metric-strip">
      <div class="m-cell m-main"><div class="k">本月结余</div><div class="v num">${f.in-f.out>=0?'+':'−'}¥${abs(f.in-f.out)}</div><div class="m-note">实际</div></div>
      <div class="m-cell"><div class="k">收入</div><div class="v num">+¥${fmt(f.in)}</div></div>
      <div class="m-cell"><div class="k">支出</div><div class="v num">−¥${fmt(f.out)}</div></div>
      <div class="m-cell"><div class="k">储蓄率</div><div class="v num">${f.in?((f.in-f.out)/f.in*100).toFixed(1):'0.0'}%</div></div>
    </div>`;
  }
  if(tab==='cash'){
    /* 第六轮：四格 = 期末现金总量 + 经营 / 投资 / 筹资净额（等宽 .flat）——
       「账户间转账」不再占格（转账是账户间资金移动、不改变现金总量，
       仍单列在下方流入 / 流出表内）。
       期末现金总量口径 = 现金等价账户余额合计（liquidAssets）。 */
    const g=cashFlowRows();
    return `<div class="metric-strip flat">
      <div class="m-cell"><div class="k">期末现金总量</div><div class="v num">¥${fmt(liquidAssets())}</div></div>
      <div class="m-cell"><div class="k">经营净额</div><div class="v num">${g[0].net>=0?'+':'−'}¥${abs(g[0].net)}</div></div>
      <div class="m-cell"><div class="k">投资净额</div><div class="v num">${g[1].net>=0?'+':'−'}¥${abs(g[1].net)}</div></div>
      <div class="m-cell"><div class="k">筹资净额</div><div class="v num">${g[2].net>=0?'+':'−'}¥${abs(g[2].net)}</div></div>
    </div>`;
  }
  return `<div class="metric-strip">
    <div class="m-cell m-main"><div class="k">期末市值</div><div class="v num">¥${fmt(invLatestTotal())}</div><div class="m-note">最新快照 ${invLatest().date}</div></div>
    <div class="m-cell"><div class="k">累计收益率</div><div class="v num">${(invCumReturn().rate*100).toFixed(2)}%</div></div>
    <div class="m-cell"><div class="k">XIRR</div><div class="v num">${invXirr()==null?'—':(invXirr()*100).toFixed(2)+'%'}</div></div>
    <div class="m-cell"><div class="k">TWR</div><div class="v num">${invTwr()==null?'—':(invTwr()*100).toFixed(2)+'%'}</div></div>
  </div>`;
}
/* 构成表：cols 决定列数，rows 每行给一个与列数等长的 cells 数组。
   行选项：level（0 父级 / 1 子级）、foldKey+folded（父行可折叠子行）、
          cat+type（该行可下钻）。
   opt.total：表尾合计行（首格为标签，其余按列右对齐）；
   opt.note：表下说明（写清合计口径，避免「折叠了但合计没变」的疑问）。 */
function invTable(cols,rows,opt={}){
  const head=`<thead><tr>${cols.map((c,i)=>`<th class="${i>0?'num':''}">${c}</th>`).join('')}</tr></thead>`;
  const body=rows.map(r=>{
    const arrow=r.foldKey
      ? `<button class="fold ${r.folded?'closed':''}" onclick="event.stopPropagation();toggleFold('${r.foldKey}')" aria-expanded="${!r.folded}" aria-label="${r.folded?'展开':'折叠'}子分类">${r.folded?I.foldRight:I.foldDown}</button>`
      : '';
    const cells=r.cells.map((c,i)=>`<td class="${i>0?'num':''}">${i===0?arrow+c:c}</td>`).join('');
    const cls=[r.level===1?'sub':'', r.foldKey?'grp':'', r.cat?'drill':''].filter(Boolean).join(' ');
    const drill=r.cat?`onclick="openDrill('${r.cat}','${r.type}')"`:'';
    return `<tr class="${cls}" ${drill}>${cells}</tr>`;
  }).join('');
  const foot=opt.total
    ? `<tfoot><tr class="tot"><td>${opt.total[0]}</td>${opt.total.slice(1).map(c=>`<td class="num">${c}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<table class="inv">${head}<tbody>${body}</tbody>${foot}</table>`
    + (opt.note?`<div class="tbl-note">${opt.note}</div>`:'');
}
/* 分类构成表（报表用）：二级层级 + 父行折叠 + 表尾合计行。
   列按语义取值（分类 / 笔数 / 金额 / 占比），因此 PC 四列与移动两列可共用。
   opt.note===false 时不带表下说明 —— 两栏并排时说明共用一条放表格外，
   避免左右说明高度不一致破坏表尾合计的对齐。 */
function catTable(type,cols,opt={}){
  const rows=catRows(type);
  const total=catRowsTotal(type);
  const n=rows.filter(r=>r.level===0).reduce((s,r)=>s+r.n,0);
  const cellOf=(r,c)=>{
    if(/分类|项目/.test(c)) return r.name;
    if(/笔数/.test(c)) return r.n+' 笔';
    if(/占比/.test(c)) return (r.share*100).toFixed(1)+'%';
    return fmt(r.amt);
  };
  const totalOf=c=>{
    if(/笔数/.test(c)) return n+' 笔';
    if(/占比/.test(c)) return '100.0%';
    return fmt(total);
  };
  return invTable(cols,rows.map(r=>({
    cells:cols.map(c=>cellOf(r,c)),
    level:r.level, foldKey:r.hasKids?foldKey(type,r.cat):null, folded:r.folded,
    cat:r.cat, type,
  })),{total:['合计',...cols.slice(1).map(totalOf)],
    note:opt.note===false?undefined:'合计口径：按一级父分类汇总（父级金额已包含其子分类），因此折叠子行不改变合计；各级「占比」均相对合计（子分类金额已计入其父级）。'});
}
function reportPc(tab){
  const f=flowTotals();
  const strip=metricStrip(tab);
  if(tab==='balance'){
    const assets=ACC.filter(a=>a.bal>0), liabs=ACC.filter(a=>a.bal<0);
    const assetSum=assets.reduce((s,a)=>s+a.bal,0);
    const liabSum=Math.abs(liabs.reduce((s,a)=>s+a.bal,0));
    /* 负债与权益表：负债行 + 所有者权益行；合计 = 负债 + 权益 = 总资产 */
    const liabRows=[...liabs.map(a=>({cells:[a.name,accKind(a),fmt(Math.abs(a.bal))]})),
                    {cells:['所有者权益','累计结余',fmt(netWorth())]}];
    return `${strip}
    <div class="fig" style="height:180px;margin:16px 0"><div class="t">资产构成（占位）</div><div class="s">线框级不画真实图表 · 高保真阶段替换为真实图形</div></div>
    <div class="tbl-cols">
      <div><div class="tbl-col-head"><span class="tbl-title">资产</span><span class="lbl">按账户</span></div>
        ${invTable(['账户','性质','金额'],assets.map(a=>({cells:[a.name,accKind(a),fmt(a.bal)]})),{total:['合计','—',fmt(assetSum)]})}</div>
      <div><div class="tbl-col-head"><span class="tbl-title">负债与权益</span><span class="lbl">按账户</span></div>
        ${invTable(['账户','性质','金额'],liabRows,{total:['合计','—',fmt(liabSum+netWorth())]})}
      </div>
    </div>
    <div class="tbl-note">时点 ${S.repTime.y}-${String(S.repTime.m).padStart(2,'0')}-${String(S.repTime.d).padStart(2,'0')} 余额。资产合计 = 负债与权益合计（互为校验的恒等式，不是 bug）；净资产 = 总资产 − 总负债（见指标条）。</div>`;
  }
  if(tab==='flow'){
    if(isFuturePeriod()){
      /* 预测期间：按预算条目给出分类级预测，不复用「实际」分类构成表 */
      const rows=budgetRows().filter(b=>b.type==='expense');
      const fo=rows.reduce((s,b)=>s+b.amount,0)||1;
      return `${strip}
      <div class="fig" style="height:180px;margin:16px 0"><div class="t">月度收支走势（占位）</div><div class="s">预测期间 · 由预算推算</div></div>
      <div class="card card-pad">
        <div class="sec-head"><h3>预测支出构成</h3><span class="lbl">按预算条目 · 预测口径</span></div>
        ${invTable(['预算条目','预测金额','占比'],rows.map(b=>({cells:[b.name,fmt(b.amount),(b.amount/fo*100).toFixed(1)+'%']})),
          {total:['合计',fmt(fo),'100.0%'],note:'预测口径：按该期间生效的预算条目金额推算，不是实际发生额。'})}
      </div>`;
    }
    return `${strip}
    <div class="fig" style="height:180px;margin:16px 0"><div class="t">月度收支走势（占位）</div><div class="s">柱位高度仅示意量级</div></div>
    <div class="tbl-cols">
      <div><div class="tbl-col-head"><span class="tbl-title">收入构成</span><span class="lbl">按分类 · 实际</span></div>
        ${catTable('income',['分类','笔数','金额','占比'],{note:false})}</div>
      <div><div class="tbl-col-head"><span class="tbl-title">支出构成</span><span class="lbl">按分类 · 实际</span></div>
        ${catTable('expense',['分类','笔数','金额','占比'],{note:false})}</div>
    </div>
    <div class="tbl-note">合计口径：按一级父分类汇总（父级金额已包含其子分类），折叠子行不改变合计；各级「占比」均相对合计。结余 = 收入合计 − 支出合计（见指标条）。</div>`;
  }
  if(tab==='cash'){
    /* M6 + 用户第三轮：现金流口径 = 经营 / 投资 / 筹资 / 未分类（分类的 cashFlowType）。
       独立「现金流分类」表已删除 —— 分组直接进入流入 / 流出表（分组行可折叠，
       与二级分类折叠同构）；转账单列「账户间转账」组，不计入三类净额。
       指标条四格等宽（见 metricStrip 的 .flat）。 */
    return `${strip}
    <div class="fig" style="height:200px;margin:16px 0"><div class="t">资金流向 · 桑基图（占位）</div><div class="s">账户 → 现金流分类 的流向 · 高保真阶段替换为真实图形</div></div>
    <div class="tbl-cols">
      <div><div class="tbl-col-head"><span class="tbl-title">流入</span><span class="lbl">按现金流分类分组 · 可折叠</span></div>
        ${cashFlowTable('in','pc')}</div>
      <div><div class="tbl-col-head"><span class="tbl-title">流出</span><span class="lbl">按现金流分类分组 · 可折叠</span></div>
        ${cashFlowTable('out','pc')}</div>
    </div>
    <div class="tbl-note">流入（收入 + 退款）/ 流出（支出 + 转账）按交易的现金流属性分组；现金流属性是分类的局部字段，二级分类未标注时继承一级分类。账户间转账为账户间资金移动，不计入经营 / 投资 / 筹资三类净额。点分组行折叠 / 展开。</div>`;
  }
  return `${strip}
  <div class="fig" style="height:180px;margin:16px 0"><div class="t">净值走势（占位）</div><div class="s">数据来自配置快照链 · 高保真阶段替换为真实曲线</div></div>
  <div class="tbl-cols">
    <div><div class="tbl-col-head"><span class="tbl-title">资产分布</span><span class="lbl">当前 vs 目标</span></div>
      ${invDistTablePc()}</div>
    <div><div class="tbl-col-head"><span class="tbl-title">期间投入与指标</span><span class="lbl">快照链口径</span></div>
      ${invTable(['项目','金额'],[
        {cells:['期初投入',fmt(invTotalOf(invSorted()[0]))]},
        {cells:['期间投入',fmt(invIn())]},
        {cells:['期间取出',fmt(invOut())]},
        {cells:['期末市值',fmt(invLatestTotal())]},
        {cells:['累计收益',fmt(invCumReturn().val)]},
        {cells:['累计收益率',(invCumReturn().rate*100).toFixed(2)+'%']},
        {cells:['XIRR',invXirr()==null?'—':(invXirr()*100).toFixed(2)+'%']},
        {cells:['TWR',invTwr()==null?'—':(invTwr()*100).toFixed(2)+'%']},
        {cells:['投资占总资产',(invWeight()*100).toFixed(1)+'%']},
        {cells:['本期费用',fmt(invFees())]},
      ],{total:['合计','—']})}</div>
  </div>
  <div class="tbl-note">偏差 = 当前占比 − 目标比例；再平衡金额 = 目标金额 − 当前金额（正数需增持，负数需减持）。XIRR 按现金流与实际间隔折算；TWR 剔除期间投入的影响再年化，两者口径不同、不互相替代。</div>
  <div class="card card-pad" style="margin-top:16px">
    <div class="sec-head"><h3>投资账户明细</h3><span class="lbl">按账户 × 资产类别</span></div>
    ${invAccountTablePc()}
  </div>
  <div class="card card-pad" style="margin-top:16px">
    <div class="sec-head"><h3>快照链</h3><span class="lbl">最近 ${SNAP_SHOW} 期 · 共 ${invPeriods().length} 期</span>
      <button class="btn btn-sm" onclick="openOverlay('invsnap',{})">管理快照</button></div>
    ${invSnapTimelinePc()}
  </div>`;
}
/* 资产分布表：当前占比 / 目标比例 / 偏差 / 再平衡金额（口径说明由调用方共用一条） */
function invDistTablePc(){
  const rows=invAllocation();
  return invTable(['资产类别','当前市值','当前占比','目标比例','偏差','再平衡'],
    rows.map(r=>({cells:[r.name,fmt(r.cur),(r.curRatio*100).toFixed(1)+'%',
      (r.target*100).toFixed(1)+'%',(r.dev*100>=0?'+':'')+(r.dev*100).toFixed(1)+'%',fmt(r.rebalance)]})),
    {total:['合计',fmt(invLatestTotal()),'100.0%','100.0%','—',fmt(rows.reduce((s,r)=>s+r.rebalance,0))]});
}
/* 投资账户明细树：账户 → 资产类别 */
function invAccountTablePc(){
  const rows=invAccountRows();
  if(!rows.length) return `<div class="state-wrap"><h2>还没有投资账户</h2></div>`;
  const body=rows.map(r=>{
    const kids=r.detail.map(d=>`<tr class="sub"><td>　└ ${d.cls.name}</td><td class="num">${fmt(d.amt)}</td><td class="num">${(invLatestTotal()?d.amt/invLatestTotal()*100:0).toFixed(1)}%</td></tr>`).join('');
    return `<tr class="grp"><td>${r.acc?r.acc.name:r.acc}${r.cat?' · '+r.cat.name:''}</td>
      <td class="num">${fmt(r.total)}</td><td class="num">100.0%</td></tr>${kids}`;
  }).join('');
  return `<table class="inv"><thead><tr><th>账户 / 资产类别</th><th class="num">市值</th><th class="num">占比</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr class="tot"><td>合计</td><td class="num">${fmt(invLatestTotal())}</td><td class="num">100.0%</td></tr></tfoot></table>`;
}
/* 快照链时间线：每期市值 / 净流入 / 期间收益率。
   第六轮：只显示最近 6 期、去合计行（每期独立时点，合计无意义——
   累计口径由指标条「累计收益率」承担）；下方给「查看全部 N 期」入口，
   指向 设置›报表与口径›配置快照（线框级，不展开真实数据）。 */
const SNAP_SHOW=6;
function viewAllSnaps(){ toast(`共 ${invPeriods().length} 期 · 全量列表在 设置›报表与口径›配置快照（原型演示）`); }
function invSnapTimelinePc(){
  const all=invPeriods();
  const ps=all.slice(-SNAP_SHOW);
  return invTable(['快照日期','期末市值','净流入','期间收益率'],
    ps.map(p=>({cells:[p.date,fmt(p.total),fmt(p.net),p.ret.rate==null?'—':(p.ret.rate*100).toFixed(2)+'%']})),
    {note:'期间收益率 = （本期市值 − 净流入）÷ 上期市值；首期无上期值故为「—」。'})
  + (all.length>SNAP_SHOW
    ? `<button class="btn btn-sm acct-more" style="text-align:center" onclick="viewAllSnaps()">查看全部 ${all.length} 期 <span class="set-chev">›</span></button>`
    : '');
}
function reportM(tab){
  const f=flowTotals();
  const kpis = tab==='balance'
    ? [['净资产',`¥${fmt(netWorth())}`],['总资产',`¥${fmt(ACC.filter(a=>a.bal>0).reduce((s,a)=>s+a.bal,0))}`],['总负债',`¥${fmt(Math.abs(ACC.find(a=>a.bal<0).bal))}`],['流动资产',`¥${fmt(liquidAssets())}`]]
    : tab==='flow'
    ? (isFuturePeriod()
      ? [['预测结余',`${forecastOf('income')-forecastOf('expense')>=0?'+':'−'}¥${abs(forecastOf('income')-forecastOf('expense'))}`],
         ['预测收入',`+¥${fmt(forecastOf('income'))}`],['预测支出',`−¥${fmt(forecastOf('expense'))}`],
         ['预测储蓄率',`${forecastOf('income')?((forecastOf('income')-forecastOf('expense'))/forecastOf('income')*100).toFixed(1):'0.0'}%`]]
      : [['结余',`${f.in-f.out>=0?'+':'−'}¥${abs(f.in-f.out)}`],['收入',`+¥${fmt(f.in)}`],['支出',`−¥${fmt(f.out)}`],['储蓄率',`${f.in?((f.in-f.out)/f.in*100).toFixed(1):'0.0'}%`]])
    : tab==='cash'
    ? (()=>{ const g=cashFlowRows();
        /* 第六轮：与 PC 同一套四格 —— 期末现金总量 + 经营 / 投资 / 筹资净额（无「账户间转账」格） */
        return [['期末现金总量',`¥${fmt(liquidAssets())}`],
                ['经营净额',`${g[0].net>=0?'+':'−'}¥${abs(g[0].net)}`],
                ['投资净额',`${g[1].net>=0?'+':'−'}¥${abs(g[1].net)}`],
                ['筹资净额',`${g[2].net>=0?'+':'−'}¥${abs(g[2].net)}`]]; })()
    : [['期末市值',`¥${fmt(invLatestTotal())}`],['累计收益率',`${(invCumReturn().rate*100).toFixed(2)}%`],
       ['XIRR',invXirr()==null?'—':`${(invXirr()*100).toFixed(2)}%`],['TWR',invTwr()==null?'—':`${(invTwr()*100).toFixed(2)}%`]];
  const cars = tab==='flow'
    ? [{t:'月度收支走势',s:'横滑查看更多 →'},{t:'分类占比',s:'横滑查看更多 →'}]
    : tab==='balance'
    ? [{t:'资产构成',s:'横滑查看更多 →'},{t:'净值走势',s:'横滑查看更多 →'}]
    : tab==='cash'
    ? [{t:'资金流向',s:'横滑查看更多 →'},{t:'账户流水',s:'横滑查看更多 →'}]
    : [{t:'净值走势',s:'横滑查看更多 →'},{t:'资产分布',s:'横滑查看更多 →'}];
  /* 移动端分段 tab：一次一张表。合计并入表尾合计行，不再单独成行；
     分类表支持二级与折叠（父行可折叠子行），口径写进表下说明。 */
  const assets=ACC.filter(a=>a.bal>0), liabs=ACC.filter(a=>a.bal<0);
  const assetSum=assets.reduce((s,a)=>s+a.bal,0);
  const liabSum=Math.abs(liabs.reduce((s,a)=>s+a.bal,0));
  let tblA,tblB,tblC;
  if(tab==='flow'){
    if(isFuturePeriod()){
      /* S9：预测期间移动端也给预测口径，不复用「实际」分类构成表 */
      const rows=budgetRows().filter(b=>b.type==='expense');
      const fo=rows.reduce((s,b)=>s+b.amount,0)||1;
      tblA=invTable(['预算条目','预测金额'],
        rows.map(b=>({cells:[b.name,fmt(b.amount)]})),
        {total:['合计',fmt(fo)],note:'预测口径：按该期间生效的预算条目金额推算，不是实际发生额。'});
      tblB=invTable(['项目','金额'],[
        {cells:['预测收入',fmt(forecastOf('income'))]},
        {cells:['预测支出',fmt(fo)]},
        {cells:['预测结余',fmt(forecastOf('income')-fo)]},
      ],{total:['合计','—'],note:'预测期间无实际流水。'});
    }else{
      tblA=catTable('income',['分类','金额']);
      tblB=catTable('expense',['分类','金额']);
    }
  }else if(tab==='balance'){
    tblA=invTable(['项目','金额'],assets.map(a=>({cells:[a.name,fmt(a.bal)]})),{total:['合计',fmt(assetSum)]});
    tblB=invTable(['项目','金额'],[...liabs.map(a=>({cells:[a.name,fmt(Math.abs(a.bal))]})),
      {cells:['所有者权益',fmt(netWorth())]}],
      {total:['合计',fmt(liabSum+netWorth())],note:'负债与权益合计 = 资产合计，互为校验（恒等式，不是 bug）。'});
  }else if(tab==='cash'){
    /* 用户第三轮：删除独立「现金流分类」表 —— 流入 / 流出按经营 / 投资 / 筹资 /
       未分类分组（分组行可折叠），与 PC 同一套渲染器 */
    tblA=cashFlowTable('in','m');
    tblB=cashFlowTable('out','m');
  }else{
    /* 移动端投资分析：分布 / 快照 / 账户明细 三张表分段切换 */
    tblA=invTable(['资产类别','当前市值','目标比例','再平衡'],
      invAllocation().map(r=>({cells:[r.name,fmt(r.cur),(r.target*100).toFixed(0)+'%',fmt(r.rebalance)]})),
      {total:['合计',fmt(invLatestTotal()),'100%','—'],note:'再平衡金额 = 目标金额 − 当前金额；正数需增持，负数需减持。'});
    /* 第六轮：快照链与 PC 同口径 —— 只显示最近 SNAP_SHOW 期、无合计行、尾部「查看全部」入口 */
    tblB=invTable(['快照日期','期末市值','期间收益率'],
      invPeriods().slice(-SNAP_SHOW).map(p=>({cells:[p.date,fmt(p.total),p.ret.rate==null?'—':(p.ret.rate*100).toFixed(2)+'%']})),
      {note:'期间收益率剔除期间投入的影响。'})
      + (invPeriods().length>SNAP_SHOW
        ? `<button class="btn btn-sm acct-more" style="text-align:center" onclick="viewAllSnaps()">查看全部 ${invPeriods().length} 期 <span class="set-chev">›</span></button>`
        : '');
    tblC=invTable(['账户 / 类别','市值'],invAccountRows().flatMap(r=>[
        {cells:[`${r.acc?r.acc.name:r.acc}`,fmt(r.total)]},
        ...r.detail.map(d=>({cells:[`　└ ${d.cls.name}`,fmt(d.amt)],level:1})),
      ]),{total:['合计',fmt(invLatestTotal())],note:'按投资账户 × 资产类别展开，口径为最新快照。'});
  }
  const side=S.repSide==='b'?tblB:(S.repSide==='c'&&tblC?tblC:tblA);
  const sideTabs = tab==='invest'
    ? [['a','分布'],['b','快照'],['c','账户']]
    : tab==='flow'
    ? (isFuturePeriod()?[['a','预测支出'],['b','预测汇总']]:[['a','收入'],['b','支出']])
    : tab==='cash'
    ? [['a','流入'],['b','流出']]
    : [['a','主表'],['b','对照']];
  /* 评审轮 P7：移动端指标与概念稿对齐 —— 结余/净资产/期末市值作主指标占满整行
     （现金流的四格等宽是既有口径，不设主指标）。主指标数值升一档字号。 */
  return `<div class="m-kpis">${kpis.map((k,i)=>`<div class="card ${i===0&&tab!=='cash'?'m-kpi-main':''}"><div class="k">${k[0]}</div><div class="v num">${k[1]}</div></div>`).join('')}</div>
  <div class="m-car-hint">图表占位 · 横滑切换</div>
  <div class="m-car-wrap">${cars.map(c=>`<div class="m-car"><div class="fig" style="height:140px"><div class="t">${c.t}</div><div class="s">${c.s}</div></div></div>`).join('')}</div>
  <div class="m-side-tabs">
    ${sideTabs.map(([k,l])=>`<button class="${S.repSide===k?'on':''}" onclick="setRepSide('${k}')">${l}</button>`).join('')}
  </div>
  ${side}
  ${tab==='invest'?`<button class="btn btn-sm" style="width:100%;margin-top:8px" onclick="openOverlay('invtarget')">资产类型与目标比例 · 配置</button>`:''}
  ${S.repRange?`<div class="tbl-note">期间口径：${S.repRange.from} – ${S.repRange.to}（上表合计对应该期间；示例数据为 10 月全集）。</div>`:''}`;
}

/* ================= 视图 · 预算 ================= */
/* M4：预算是「预算条目」而不是「每个分类一个月度额度」。
   条目 = 名称 + 类型（支出/收入/转账）+ 金额 + 周期 + 分类 + 账户；
   用量按条目自己的周期区间统计。页面按类型分组。 */
const BUDGET_TYPE_CN={expense:'支出预算',income:'收入预算',transfer:'转账预算'};
/* 评审轮（用户拍板）：预算支持三类 —— 支出=限额（超支告警）、收入=目标下限（看达成率）、
   转账=流量监控（看资金流转量）。已用按各条目自身周期、锚定当前日期从交易派生（B2：与总览同源）。 */
const BUDGET_TYPE_NOTE=`<div class="tbl-note">三类预算：支出 = 限额（超支告警）· 收入 = 目标下限（看达成率）· 转账 = 流量监控（看流转量）。已用按各条目自身周期、锚定当前日期从交易派生，与总览同源。</div>`;
function viewBudgets(device){
  const rows=budgetRows();
  const tot=budgetTotal('expense');
  const pct=tot.limit?Math.round(tot.used/tot.limit*100):0;
  const over=rows.filter(b=>b.over);
  const ring=`<div class="ring-wrap"><div class="center"><div class="pct num">${pct}%</div><div class="lbl">本月已用</div></div></div>`;
  const groups=['expense','income','transfer'].map(t=>{
    const list=rows.filter(b=>b.type===t);
    if(!list.length) return '';
    const used=list.reduce((s,b)=>s+b.used,0), lim=list.reduce((s,b)=>s+b.amount,0);
    const head=`<div class="set-sec">${BUDGET_TYPE_CN[t]} · ${list.length} 条 · 已用 ¥${fmt(used)} / ¥${fmt(lim)}</div>`;
    return head+(device==='m'?list.map(b=>budRowM(b)).join(''):list.map(b=>budRowPc(b)).join(''));
  }).join('');
  if(device==='m'){
    return withState(`
    <div class="m-head"><h1>预算</h1><div class="m-head-acts"><button class="btn btn-sm" onclick="openOverlay('budget',{mode:'edit'})">调整</button></div></div>
    <div class="card card-pad" style="margin-bottom:12px">
      <div class="budget-ring">${ring}
        <div><div class="lbl">支出预算 / 已用</div><div class="num" style="font-size:var(--mb-fs-3);font-weight:600">¥${fmt(tot.used)} / ¥${fmt(tot.limit)}</div>
        <div class="lbl" style="margin-top:4px">${over.length?`${over.length} 个预算条目超支`:'暂无超支'}</div></div>
      </div>
    </div>
    ${groups}
    ${BUDGET_TYPE_NOTE}`);
  }
  return withState(`
  <div class="page-head"><h1>预算</h1><span class="desc">2026 年 10 月 · ${BUDGETS.length} 个预算条目</span>
    <button class="btn btn-sm" style="margin-left:auto" onclick="openOverlay('budget',{mode:'edit'})">调整预算</button></div>
  <div class="card card-pad" style="margin-bottom:16px">
    <div class="budget-ring">${ring}
      <div style="flex:1">
        <div class="lbl">支出预算 / 已用</div>
        <div class="num" style="font-size:var(--mb-fs-4);font-weight:700">¥${fmt(tot.used)} / ¥${fmt(tot.limit)}</div>
        <div class="tbl-note">${over.length?`超支条目：${over.map(b=>b.name).join('、')}（点击下方条目处理）`:'暂无超支'}</div>
      </div>
    </div>
  </div>
  <div class="card card-pad">
    <div class="sec-head"><h3>预算条目</h3><span class="sec-sub">名称 + 类型 + 金额 + 周期 + 分类 + 账户 · 点击行可调整 / 处理超支</span></div>
    ${groups}
    <button class="btn primary set-cta" onclick="openOverlay('budget',{mode:'new'})">＋ 新增预算条目</button>
    ${BUDGET_TYPE_NOTE}
  </div>`);
}

/* ================= 视图 · 设置 ================= */
/* 载体（第十二轮定稿）：PC = 左导航 + 右内容（一次一个分区）；
   移动 = 列表 → 全屏二级页。行内编辑 / 选值走浮层；报表 ⚙ 原地面板属「在报表里调」。 */
/* 设置分区清单（第十二轮）：PC 左导航与移动端列表一一对应 ——
   同一组分区、同一顺序、同一命名（配置中心 4 项 + 通用 3 项）。 */
const CFG_ENTRIES=[
  ['acctcfg','账户分类',()=>`资产 ${ACC_CATS.filter(c=>c.type==='asset').length} · 负债 ${ACC_CATS.filter(c=>c.type==='liability').length} · ${ACC.length} 个账户`],
  ['catcfg','收支分类',()=>`收入 ${CATS.income.length} · 支出 ${CATS.expense.length} · 转账 ${CATS.transfer.length}`],
  ['cfcfg','现金流分类',()=>'按活动归属配置资产与交易分类'],
  ['invtarget','投资资产类型',()=>`${INV_CLASSES.length} 个资产类别 · 目标比例与再平衡`],
];
const GENERIC_ENTRIES=['列表显示','数据与备份','回收站'];
function setSettingsTab(id){ S.setTab=id; render(); }
function viewSettings(device){
  if(device==='m'){
    /* 移动端：列表 → 全屏二级页（配置中心 4 项 + 通用 3 项，与 PC 左导航同一组分区 / 顺序 / 命名） */
    const cfgRows=CFG_ENTRIES.map(([id,t,sum])=>
      `<button class="set-item set-link" onclick="openOverlay('${id}',{page:true})"><span class="meta"><span class="t">${t}</span><span class="s">${sum()}</span></span><span class="set-chev">${I.chev}</span></button>`).join('');
    return withState(`
    <div class="m-head"><h1>设置</h1></div>
    <div class="card card-pad" style="padding:0 12px">
      <div class="set-sec" style="margin-top:0">配置中心</div>
      ${cfgRows}
      <div class="set-sec">通用</div>
      ${GENERIC_ENTRIES.map(t=>`<button class="set-item set-link" onclick="openOverlay('setsec',{sec:'${t}',page:true})"><span class="meta"><span class="t">${t}</span><span class="s">${settingsHint(t)}</span></span><span class="set-chev">${I.chev}</span></button>`).join('')}
    </div>`);
  }
  /* PC（第十二轮）：左导航 + 右内容 —— 同一时间只显示一个分区，页面高度不随分区增多而增长；
     与移动端「列表 → 二级页」一一对应（同一组分区 / 顺序 / 命名）。
     页面级入口 = 页面（无弹窗）；行内编辑 / 选值仍走浮层。 */
  const navItem=(id,t)=>`<button class="set-nav-item ${S.setTab===id?'on':''}" onclick="setSettingsTab('${id}')">${t}</button>`;
  const nav=`
    <nav class="set-nav">
      <div class="set-sec" style="margin-top:0">配置中心</div>
      ${CFG_ENTRIES.map(([id,t])=>navItem(id,t)).join('')}
      <div class="set-sec">通用</div>
      ${GENERIC_ENTRIES.map(t=>navItem(t,t)).join('')}
    </nav>`;
  const cur=CFG_ENTRIES.find(([id])=>id===S.setTab);
  const main=cur
    ? `<div class="card card-pad">
        <div class="sec-head"><h3>${cur[1]}</h3><span class="sec-sub">${cur[2]()}</span></div>
        ${[()=>acctCfgOverlay(),()=>catCfgOverlay(),()=>cfCfgOverlay(),()=>invTargetOverlay({})][CFG_ENTRIES.indexOf(cur)]()}
      </div>`
    : settingsContent(S.setTab,'pc');
  return withState(`
  <div class="page-head"><h1>设置</h1><span class="desc">配置中心 + 通用 · 与报表「设置」同源</span></div>
  <div class="set-layout">
    ${nav}
    <div class="set-main">${main}</div>
  </div>`);
}
const settingsHint = t => t==='列表显示'?'列显示 · 密度 · 报表视图'
  :t==='数据与备份'?'导入 / 导出 / 回滚 / 危险区'
  :`${S.recycle.length} 条可恢复`;
function settingsContent(tab,device){
  /* 账户 / 分类 / 现金流 / 投资口径四类对象配置已移入配置中心弹窗
     （acctcfg / catcfg / cfcfg / invtarget，见 overlays.js），此处只留通用卡片。 */
  if(tab==='列表显示'){
    /* 第九轮：只保留「真的能改变界面」的项 —— 密度（body.dense 即时生效）、
       可选列显隐 + ⠿ 排序、报表视图 tab 显隐；必需列是纯展示死行，已删
       （以表下说明表达「列集合固定、必需列不可取消」）。 */
    const names={fee:'手续费提示',coupon:'优惠券提示',typeTag:'类型标签'};
    const descs={fee:'行内金额下方显示「含手续费」',coupon:'行内金额下方显示「券 −金额」',typeTag:'行第二行显示支出 / 收入等标签'};
    const order=S.txColOrder||['fee','coupon','typeTag'];
    /* 评审轮 T5：可选列顺序与三处配置入口同一收敛 —— ↑↓ 按钮删除，只留 ⠿ 拖拽占位
       （真实拖拽落地阶段实现），行内只剩「显示」勾选。 */
    const optRows=order.map(k=>`<div class="set-item">
        <span class="drag-handle" title="拖动调整顺序（真实拖拽落地阶段实现）">⠿</span>
        <span class="meta"><span class="t">${names[k]}</span><span class="s">${descs[k]}</span></span>
        <label class="chk"><input type="checkbox" ${S.txCols[k]?'checked':''} onchange="setTxCol('${k}',this.checked)"> 显示</label>
      </div>`).join('');
    return `<div class="card card-pad">
      <div class="sec-head"><h3>列表显示</h3><span class="sec-sub">每个开关都直接改变列表渲染 · 工具栏 ⚙ 显示原地打开本分区</span></div>
      <div class="set-item">
        <span class="meta"><span class="t">流水列表密度</span><span class="s">紧凑 / 标准 · 选择会被记住</span></span>
        <div class="seg-sm">
          <button class="${S.txDensity==='normal'?'on':''}" onclick="setDensity('normal')">标准</button>
          <button class="${S.txDensity==='compact'?'on':''}" onclick="setDensity('compact')">紧凑</button>
        </div>
      </div>
      <div class="set-sec">可选列（显隐 + ⠿ 拖动排序）</div>
      ${optRows}
      <div class="set-sec">报表视图（tab 显隐）</div>
      ${REP_TABS.map(([k,l])=>`<div class="set-item">
        <span class="meta"><span class="t">${l}</span><span class="s">${k==='balance'?'时点报表':'期间报表'}</span></span>
        <label class="chk"><input type="checkbox" ${repViews().includes(k)?'checked':''} onchange="toggleRepView('${k}',this.checked)"> 显示</label>
      </div>`).join('')}
      <div class="tbl-note">列集合固定，不提供新增 / 删除列（照 ProTable 列设置模式：只做显隐 + 排序）；名称 / 金额 / 日期·账户为必需列，固定显示不可隐藏。</div>
    </div>`;
  }
  if(tab==='数据与备份'){
    /* 导入 / 导出 / 回滚 + 危险区 */
    return `<div class="card card-pad">
      <div class="sec-head"><h3>数据与备份</h3><span class="sec-sub">导入 / 导出 / 回滚</span></div>
      <div class="set-item"><span class="meta"><span class="t">导入数据</span><span class="s">三步向导 · 支持 ZIP / CSV / JSON</span></span>
        <button class="btn btn-sm" onclick="openOverlay('importw')">导入</button></div>
      <div class="set-item"><span class="meta"><span class="t">导出数据</span><span class="s">导出备份（ZIP，含全部数据）</span></span>
        <button class="btn btn-sm" onclick="toast('导出已开始（原型演示）')">导出</button></div>
      <div class="set-item"><span class="meta"><span class="t">回滚点</span><span class="s">${S.rollbackPts.length} 个可用备份</span></span>
        <button class="btn btn-sm" onclick="openOverlay('rollback')">查看</button></div>
      <div class="set-sec">危险区</div>
      <div class="set-item"><span class="meta"><span class="t">清空全部数据</span><span class="s">不可撤销 · 建议先导出备份</span></span>
        <button class="btn btn-sm danger" onclick="dangerReset()">清空</button></div>
      <div class="set-item"><span class="meta"><span class="t">重置全部设置</span><span class="s">分类 / 账户分类 / 目标比例回到初始值</span></span>
        <button class="btn btn-sm danger" onclick="dangerReset()">重置</button></div>
      <div class="set-item"><span class="meta"><span class="t">操作记录</span><span class="s">${S.opLog.length} 条危险操作留痕</span></span>
        <button class="btn btn-sm" onclick="openOverlay('oplog')">查看</button></div>
    </div>`;
  }
  if(tab==='回收站'){
    /* B2 蓝图特性（软删除 + 回收站）的线框示意；B2 落地后此分区接真实数据 */
    const rows=S.recycle.map(r=>`<div class="set-item">
      <span class="meta"><span class="t">${r.txt}</span><span class="s">−¥${fmt(r.amt)} · 删除于 ${r.delAt}</span></span>
      <button class="btn btn-sm" onclick="restoreRecycle('${r.id}')">恢复</button>
    </div>`).join('');
    return `<div class="card card-pad">
      <div class="sec-head"><h3>回收站</h3><span class="sec-sub">删除的交易先进回收站 · 可恢复</span></div>
      ${rows||`<div class="state-wrap"><h2>回收站是空的</h2><p>删除的交易会在这里保留，可随时恢复。</p></div>`}
      ${S.recycle.length?`<button class="btn set-cta danger" style="width:100%" onclick="clearRecycle()">清空回收站（不可恢复）</button>`:''}
      <div class="tbl-note">对应蓝图 B2（软删除 + 审计事件 + 撤销 + 回收站）：删除即入站、恢复走审计事件回写；当前为线框示意。</div>
    </div>`;
  }
  /* 第九轮：原「偏好」卡已删 —— 启动视图 / 千分位 / 主题全是无真实效果的占位
     （主题归 U10）。保留的每一项都必须真的改变界面。 */
  return '';
}
/* 回收站动作（B2 线框示意）：恢复 = 回到流水；清空 = 危险操作留痕 */
function restoreRecycle(id){
  const i=S.recycle.findIndex(r=>r.id===id);
  if(i<0) return;
  const [r]=S.recycle.splice(i,1);
  render();
  toast(`已恢复「${r.txt}」到流水`,'撤销',()=>{ S.recycle.splice(i,0,r); render(); });
}
function clearRecycle(){
  const n=S.recycle.length;
  S.recycle=[];
  logOp(`清空回收站（${n} 条）`);
  render();
  toast('回收站已清空','提示');
}
/* 列显示 / 密度（设置 › 列表显示，⚙ 显示原地面板同一渲染器） */
function setTxCol(k,v){ S.txCols[k]=v; render(); }
function setDensity(v){
  S.txDensity=v;
  try{ localStorage.setItem('mb.txDensity',v); }catch(e){}
  render();
  toast(v==='compact'?'已切换为紧凑密度':'已切换为标准密度');
}
/* 第七轮：分类分区 Tab / 行内删除（保护规则见分区注释） */
function setCatTab(t){ S.catTab=t; render(); }
function delCatInline(type,id){
  if((CATS[type]||[]).some(c=>c[2]===id)) return;      /* 有子分类：按钮已禁删 */
  const txN=TXNS.filter(t=>t.cat===id&&catType(t.type)===type).length;
  if(txN){ openOverlay('catedit',{id,type}); toast(`该分类有 ${txN} 笔交易，请先选择转移目标`,'提示'); return; }
  const i=CATS[type].findIndex(c=>c[0]===id);
  if(i<0) return;
  const [rm]=CATS[type].splice(i,1);
  delete CASHFLOW[id];
  render();
  toast(`已删除「${rm[1]}」`,'撤销',()=>{ CATS[type].splice(i,0,rm); render(); });
}
/* 第七轮：账户行内删除两步确认（第一次点变「确认删除」，3 秒未确认自动复位）。
   第九轮：删除保护与分类同语义 —— 有交易引用的账户拒绝删除并说明（按钮禁用 + 双保险），
   无引用账户走两步确认。 */
function delAcc(id){
  const refN=TXNS.filter(t=>t.acc===id||t.toAcc===id).length;
  if(refN){ toast(`该账户有 ${refN} 笔交易引用，删除前先处理这些交易`,'提示'); return; }
  if(S.accConfirm!==id){
    S.accConfirm=id; render();
    setTimeout(()=>{ if(S.accConfirm===id){ S.accConfirm=null; render(); } },3000);
    return;
  }
  const i=ACC.findIndex(a=>a.id===id);
  if(i<0) return;
  const [rm]=ACC.splice(i,1);
  S.accConfirm=null; render();
  toast('账户已删除','撤销',()=>{ ACC.splice(i,0,rm); render(); });
}
/* 两步确认态的菜单项视觉由 .row-mi.warn 提供（底色 + 加粗，与 .btn.confirming 同语义） */
/* O4：危险操作留痕。审计是「事后可查」，不阻塞正常流程 */
function opLogOverlay(){
  if(!S.opLog.length) return `<div class="state-wrap"><h2>暂无危险操作记录</h2>
    <p>清空数据、重置设置、覆盖导入等操作会在这里留痕。</p></div>`;
  return `
    <div class="hint" style="margin-bottom:12px">只记录不可撤销或会覆盖数据的操作，供事后核对。</div>
    <div class="lv-list">${S.opLog.map(l=>`
      <div class="lv"><span class="k">${l.time}</span><span class="v">${l.what}</span></div>`).join('')}</div>`;
}
function logOp(what){
  S.opLog.unshift({time:new Date().toLocaleString('zh-CN',{hour12:false}),what});
  if(S.opLog.length>50) S.opLog.pop();
}
/* O4：危险操作留痕。审计是「事后可查」，不阻塞正常流程 */
function dangerReset(){
  toast('危险操作需要二次确认（原型演示）');
  logOp('危险区操作触发（清空 / 重置）');
  render();
}

/* ================= 视图分发 ================= */
const VIEWS={dash:viewDash,txns:viewTxns,reports:viewReports,budgets:viewBudgets,settings:viewSettings};
