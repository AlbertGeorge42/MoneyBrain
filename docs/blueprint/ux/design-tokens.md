# 设计 Token（UX4，darkfirst 定稿）

> 这份文档回答：**界面长什么样，凭什么这么定**。
> 它是 R2–R3 与 U12 的**唯一权威输入**（U4/U6/U7 并入 R2/R3 验收）；视觉一致性类条目（U5、U8–U11）已取消。
> 段三照此实现；U12（R3 后）将产出 `docs/design-system.md`，届时据此收口。
>
> **规则：token 之外不得出现字面量。** 出现即返工。
>
> **主题口径（v0.6）**：darkfirst 为唯一皮肤，**默认 `light`，`dark` 为可选次要方案**。
> 本文给落地值与最低对比度；逐项实测留在 UX5b 交付记录。实现约定见 [dev-guide.md](../../dev-guide.md) §2.3，本文不重复。

---

## 1. 视觉方向：「暗色优先」（darkfirst）

隐喻是**一块安静的黑板 + 一支荧光笔**——不是银行 App，也不是 SaaS 后台。

| 决策 | 具体化 | 理由 |
|---|---|---|
| 中性炭黑底 | `#F6F6F4` / `#0D0F10`，不偏黄也不纯黑 | 数字和图表在两种底色上都稳；避免暖纸底与财务红绿抢色 |
| 青柠拆两档 | 文字 `#356B0C` / 填充 `#A3E635` | 一支深绿保证文字 5.95，一支亮青柠负责「活」的填充；一档无法同时满足 |
| 等宽数字 | JetBrains Mono → Cascadia Mono → Consolas + `tabular-nums` | 金额必须上下对齐；Windows 实际落到 Consolas |
| 无衬线标题 | 标题与正文同一字栈 | 12–14px 高密度下衬线会糊；记账工具不需要「封面感」 |
| 零装饰 | 无纸纹、无渐变、无彩色阴影 | 视觉重量留给数字与状态色 |
| 单一强调色 | 两支青柠（文字 / 填充） | 多强调色会让「哪个是主色」失焦 |

**反模式**：橙色支出（警告语义）、红色普通提示、渐变按钮、彩色阴影、玻璃拟态、圆角过大的卡片、emoji 当图标。
分类图标用 lucide 线性图标，类别靠颜色与文字区分，不靠 emoji。

---

## 2. 色彩

### 2.1 语义角色

颜色是**角色**，不是装饰。每个角色只有一个色值；下表即 `--mb-color-*` 全集（HF 批次 1 增补 `warning` 与 6 项主卡 token）。

**面 / 字 / 线 / 品牌 / 状态**

| Token | 浅色（默认） | 暗色 | 角色 |
|---|---|---|---|
| `--mb-color-surface` | `#F6F6F4` | `#0D0F10` | 页面底 |
| `--mb-color-surface-sunken` | `#EDEDEA` | `#08090A` | 下沉区（侧栏、输入底） |
| `--mb-color-surface-raised` | `#FFFFFF` | `#16191B` | 面板 / 卡片 / 弹层 |
| `--mb-color-surface-hover` | `#EFEFEC` | `#1D2226` | 行悬停、列表项悬停 |
| `--mb-color-surface-overlay` | `rgba(20,22,26,.45)` | `rgba(0,0,0,.65)` | 遮罩 |
| `--mb-color-text-primary` | `#14161A` | `#ECEEEF` | 主文字 |
| `--mb-color-text-secondary` | `#565A60` | `#9CA3A8` | 次级文字 |
| `--mb-color-text-tertiary` | `#63686E` | `#7F878D` | 辅助 / 元信息 |
| `--mb-color-text-inverse` | `#F7FBEF` | `#14161A` | 反色承载上的文字 |
| `--mb-color-border` | `#DFE1DD` | `#242A2E` | 分隔线、卡片边 |
| `--mb-color-border-strong` | `#CBCEC8` | `#333A3F` | 输入框、强分隔 |
| `--mb-color-accent` | `#356B0C` | `#A3E635` | 强调**文字**：图标、指示条、链接、focus 环 |
| `--mb-color-accent-fill` | `#A3E635` | `#A3E635` | 强调**填充**：按钮底、徽标、图表强调块 |
| `--mb-color-on-accent-fill` | `#0D1005` | `#0D1005` | 填充上的墨字（禁止用白） |
| `--mb-color-accent-fill-hover` | `#93D12A` | `#B0E352` | 填充悬停 |
| `--mb-color-accent-fill-pressed` | `#84BE1F` | `#93D12A` | 填充按下 |
| `--mb-color-accent-soft` | `#E4F0D7` | `#1C2611` | 选中底、浅色强调块 |
| `--mb-color-focus` | `#356B0C` | `#A3E635` | 焦点环 |
| `--mb-color-skeleton` | `#E7E8E3` | `#1A1E20` | 骨架屏 |

**财务语义**

| Token | 浅色（默认） | 暗色 | 角色 |
|---|---|---|---|
| `--mb-color-income` | `#1B7A48` | `#4ADE80` | 收入 / 收益（正向） |
| `--mb-color-income-bg` | `#E7F3EB` | `#0F2417` | 收入 chip 底 |
| `--mb-color-expense` | `#A64D56` | `#F0A4AB` | 支出（文字档，18px 以下） |
| `--mb-color-expense-display` | `#B65B62` | `#F0A4AB` | 支出大号金额 / 图形填充档（≥24px 或 ≥18.66px 粗） |
| `--mb-color-expense-bg` | `#F9E7E3` | `#2A1615` | 支出 chip 底 |
| `--mb-color-transfer` | `#1D6D8E` | `#4C9FC4` | 转账（无损益） |
| `--mb-color-transfer-bg` | `#E5F0F4` | `#13252D` | 转账 chip 底 |
| `--mb-color-danger` | `#7A1220` | `#E5484D` | 危险（仅破坏性动作） |
| `--mb-color-danger-solid` | `#6C1019` | `#6C1019` | 危险实心按钮（二次确认） |
| `--mb-color-danger-bg` | `#FAE8E6` | `#241114` | 危险 chip / 提示底 |
| `--mb-color-on-danger` | `#FFE9E7` | `#FFE9E7` | 危险实心上的文字 |
| `--mb-color-warning` | `#8A5A00` | `#E5B54A` | 预算 80–100% 预警（文字与进度条） |

**分类与图表辅助**

| Token | 浅色（默认） | 暗色 | 角色 |
|---|---|---|---|
| `--mb-color-cat-1` … `-6` | `#3F7D0F` `#0F7D6A` `#1B6FA8` `#6D4FD6` `#C25383` `#B07A0B` | `#A3E635` `#4CC9E8` `#A78BFA` `#D9A21B` `#34D399` `#FF7AB6` | 分类区分（无语义） |
| `--mb-color-chart-axis` | `#63686E` | `#7F878D` | 坐标轴文字 / 刻度 |
| `--mb-color-chart-grid` | `#E3E5E0` | `#242A2E` | 网格线 |
| `--mb-color-chart-tooltip-bg` | `#14161A` | `#16191B` | 图表 tooltip 底 |
| `--mb-color-chart-tooltip-ink` | `#F3F4F0` | `#ECEEEF` | 图表 tooltip 文字 |
| `--mb-color-chart-annot-pos` | `#1B7A48` | `#4ADE80` | 图表正向标注（= 收入绿） |
| `--mb-color-chart-annot-neg` | `#A64D56` | `#F0A4AB` | 图表负向标注（= 支出红） |

**主卡专用（HF 批次 1，6 项）**

主卡是**最高层级卡片**，**不再常驻深底**：浅色用 `surface-raised`（与普通卡片同底，靠整行宽度、40px 数字与排版做焦点），暗色底色比普通卡片高一档（`surface-raised` → `#1D2226`）并加 1px 高光边。涨跌色直接取文字档财务语义色；浅色 `expense-display` 对白底仅 4.16，只用于 ≥18.66px 粗的大号金额，12px chip 必须用 `expense`。

| Token | 浅色（默认） | 暗色 | 角色 |
|---|---|---|---|
| `--mb-color-hero-bg` | `surface-raised`（`#FFFFFF`） | `#1D2226` | 主卡底（暗色 = 比 `surface-raised` 高一档） |
| `--mb-color-hero-ink` | `text-primary`（`#14161A`） | `#ECEEEF` | 主卡主文字 |
| `--mb-color-hero-muted` | `text-secondary`（`#565A60`） | `#9CA3A8` | 主卡标签 / 辅助文字 |
| `--mb-color-hero-line` | `border`（`#DFE1DD`） | `rgba(255,255,255,.16)` | 主卡分隔线 / 暗色 1px 高光边 |
| `--mb-color-hero-pos` | `income`（`#1B7A48`） | `income`（`#4ADE80`） | 主卡正向涨跌（直接取 `income`） |
| `--mb-color-hero-neg` | `expense`（`#A64D56`） | `expense-display`（`#F0A4AB`） | 主卡负向涨跌（浅色取文字档 `expense`，暗色取 `expense-display`） |

### 2.2 Mantine 色阶（四条 10 档）

`theme.colors` 只放这四条；暗色 body 默认取 `dark[7]`，与 `--mb-color-surface` 同值。

```ts
gray   = ['#FFFFFF','#F7F7F5','#EFEFEC','#E4E5E1','#D5D7D2','#B9BDB6','#8D938C','#6A7069','#404540','#14161A']
dark   = ['#F3F4F4','#E4E6E6','#C7CBCB','#A5AAAB','#83898A','#1D2226','#16191B','#0D0F10','#08090A','#050607']
brand  = ['#F5FCE8','#E9F7CE','#D5F0A6','#C0E878','#B0E352','#A3E635','#8FCF26','#6BA414','#356B0C','#244A06']
danger = ['#FFF1EF','#FFE0DD','#FFC5C1','#FF9E9A','#F2555A','#E5484D','#B42318','#7A1220','#6C1019','#4E0F0F']
```

| 取值 | 值 | 用途 |
|---|---|---|
| `dark[7]` | `#0D0F10` | 暗色 body，精确等于 `surface` |
| `dark[8]` | `#08090A` | 暗色下沉面 |
| `brand[5]` | `#A3E635` | `accent-fill`；`primaryShade = { light: 5, dark: 5 }` |
| `brand[8]` | `#356B0C` | `accent` 文字档 |
| `danger[5]` | `#E5484D` | 暗色 `danger` |
| `danger[7]` | `#7A1220` | 亮色 `danger` |
| `danger[8]` | `#6C1019` | `danger-solid`（比 danger 更深） |

`dark[4]`（Mantine 默认边框位）太亮，必须覆写 `--mantine-color-default-border` = `border`；`dark[5]/[6]` 覆写 hover / 面板。

### 2.3 两档强调色与边界

**一档 accent 不可能同时满足「文字可读」与「填充鲜活」**：深绿做填充沉闷，亮青柠做文字只有 1.39。

| 层 | 浅色 | 暗色 | 只用于 |
|---|---|---|---|
| `accent`（文字档） | `#356B0C` | `#A3E635` | 文字、图标、指示条、链接、focus 环 |
| `accent-fill`（填充档） | `#A3E635` | `#A3E635` | 按钮底、徽标、Switch track、Checkbox 指示块、图表强调 |
| `on-accent-fill` | `#0D1005` | `#0D1005` | 填充上的字（12.74，禁止白字） |

- 文字档对三档底色：浅色 5.95 / 5.49 / 6.44，暗色 12.74 / 13.22 / 11.71。
- 填充档对页面：浅色 **1.39**、暗色 **12.74** → 浅色填充面必须加 **1px `#356B0C` 描边**（边界 5.95、对填充 4.27）；阴影不能替代。实现细节见开发手册 §2.3。
- `expense` 的大号金额 / 填充档由 `expense-display` 承担，避免把文字档拉亮。

### 2.4 暗色是独立设计，不是反色

暗色**不是**把浅色值反过来。两套色板各自调校：

- 暗色底是**中性炭黑** `#0D0F10`（`dark[7]`），下沉 `#08090A`（`dark[8]`），面板 `#16191B`——
  不偏绿、也不是纯黑。浅色底 `#F6F6F4` 同理不偏黄。
- 浅色的深墨字 `#14161A` 不能反成纯白，暗色前景用柔白 `#ECEEEF`，避免大块刺眼白字。
- 饱和色在暗背景上要**提亮**：支出 `#A64D56` → `#F0A4AB`；收入 `#1B7A48` → `#4ADE80`；
  转账 `#1D6D8E` → `#4C9FC4`。
- 强调色在暗色下从「深绿文字」变成「亮青柠」，`accent` 与 `accent-fill` 合并为
  `#A3E635`（12.74，无需描边）——同一角色的不同表达，不是同一色值的反转。

### 2.5 对比度校验（硬性验收）

**正文前景在三种底色（surface / sunken / raised）上必须全部 ≥ 4.5:1。**
下表给亮/暗两套的**三底最低值**（完整逐项实测见 UX5b 交付记录）：

| 前景 | 浅色最低 | 暗色最低 | 判定 |
|---|---|---|---|
| `--mb-color-text-primary` | 15.44 | 15.17 | ✓ |
| `--mb-color-text-secondary` | 5.91 | 6.91 | ✓ |
| `--mb-color-text-tertiary` | 4.79 | 4.84 | ✓ |
| `--mb-color-accent` | 5.49 | 11.71 | ✓ |
| `--mb-color-focus` | 5.49 | 11.71 | ✓ |
| `--mb-color-income` | 4.56 | 10.14 | ✓ |
| `--mb-color-expense` | 4.69 | 8.92 | ✓ |
| `--mb-color-transfer` | 4.93 | 5.94 | ✓ |
| `--mb-color-danger` | 9.25 | 4.51 | ✓ |

**图形专用（非文字，≥3:1 即过，不参与正文 4.5 验收）**：

- `--mb-color-cat-1` … `-6`：浅色最低 **3.44**（`cat-6` `#B07A0B`），暗色最低 7.06。
  分类色只用于图形（色块、折线、堆叠段），不得当正文色。
- `--mb-color-expense-display`：浅色 4.16 / 3.84 / 4.50，仅用于 ≥24px 或 ≥18.66px 粗的
  大号金额与图形填充；正文尺寸一律用 `expense` 文字档。

状态与边界配对（通过项不逐条列）：

| 场景 | 浅色 | 暗色 | 处置 |
|---|---|---|---|
| `on-accent-fill` on `accent-fill` | 12.74 | 12.74 | ✓ |
| `accent` on `accent-soft`（选中） | 5.44 | 10.43 | ✓ |
| 主卡 ink / muted / pos / neg on `hero-bg` | 18.11 / 6.94 / 5.35 / 5.50 | 13.9 / 6.3 / 9.3 / 8.1 | ✓（浅色主卡为白底卡片，数值为白底实测） |
| `accent-fill` vs 页面 | **1.39** | 12.74 | 浅色必须 1px `#356B0C` 描边（见开发手册 §2.3） |
| `danger-solid` vs 页面 | 11.25 | **1.58** | 暗色实心危险块需 1px 描边 |
| `danger` vs `expense` 亮度比 | 3.0–3.9× | 2.2× | 可靠明度 + 场景 + 图标/文案分离 |

> 段三落地时内置**实时对比度自检面板**（设置 → 设计说明 → 对比度自检，
> 切主题实时重算）。这不是装饰——它是把「≥4.5:1」从口号变成可验证事实的手段。
> 这条对应 [stage-1](../stage-1-experience.md) U12 的「可选开发自检工具」验收项，
> 不阻塞 R1–R3：面板缺失不算违规，但一旦提供必须按当前 token 实时重算。

### 2.6 图表分类色板独立于语义色

`--mb-color-cat-1` … `-6`：用于饼图、堆叠条、桑基的分类区分。

**为什么不用语义色**：语义色有固定含义（绿=收入、红=支出），
若拿来做分类色，用户会把「红色的那一块」读成「支出」。分类色必须**无语义**。

浅色：`#3F7D0F` `#0F7D6A` `#1B6FA8` `#6D4FD6` `#C25383` `#B07A0B`
暗色：`#A3E635` `#4CC9E8` `#A78BFA` `#D9A21B` `#34D399` `#FF7AB6`

暗色下的分类色是**另调的一套**——沿用浅色档在暗背景上对比度不达标。

碰撞检查（支出改红后新增）：

- 浅色 `cat-5` 玫红 vs 支出玫瑰红 ΔE **21.5** → 分类色不得编码收入/支出，图例必须带名称。
- 浅色 `cat-1` 深绿 vs 收入绿 ΔE 27.8（deutan 28.2）→ 可共存，但「绿色分类」与「收入」
  必须靠图例区分。
- 暗色 `cat-6` 玫粉 vs 支出 `#F0A4AB` ΔE 32.4 → 可共存。

---

## 3. 字号阶梯（7 档，禁止出档）

| Token | 值 | 用途 |
|---|---|---|
| `--mb-fs-0` | 12px | 辅助说明、元信息、图例 |
| `--mb-fs-1` | 13px | 次级正文、按钮、标签 |
| `--mb-fs-2` | 14px | 正文基准 |
| `--mb-fs-3` | 16px | 卡片标题、金额（列表） |
| `--mb-fs-4` | 20px | 区块标题、页面标题（PC）、金额（KPI） |
| `--mb-fs-5` | 28px | 页面标题（移动端）、净资产（移动端） |
| `--mb-fs-6` | 40px | 净资产主卡（PC） |

**页面标题双端**：PC 用 `--mb-fs-4`（20px），与 `--mb-fs-1`（13px）的 desc
**基线横排**（`align-items: baseline`，间距 `--mb-s-3`）；移动端用 `--mb-fs-5`（28px）
**纵排**（标题在上、元信息在下）。两端不共用同一字号档。

字号**不允许**用 `clamp()`、裸 px 或 TSX 字面量。所有档位无小数——`13px` 而不是 `13.5px`，
避免渲染时的半像素模糊。

> **线框原型的差异说明**：`prototype/styles.css` 为灰阶线框用了一套**整体压缩一档的
> 自有阶梯**（11/12/13/15/19/26/36px，间距 / 触控 44 / 密度机制与本表一致）——
> 线框追求结构密度，不按产品字号渲染；本表约束的是段三 `apps/web` 实现，
> 原型样式不作为段三验收对象。

字重只用 400 / 500 / 600 / 700。

行高：`--mb-lh-tight: 1.2`（标题、金额、表格行）、`--mb-lh-body: 1.55`（正文）。
表格行内文字统一用 `--mb-tbl-line-h`（20px），不继承正文字号行高。

---

## 4. 间距阶梯（4 的倍数）

| Token | 值 | 用途 |
|---|---|---|
| `--mb-s-1` | 4px | 图标与文字的最小间隙 |
| `--mb-s-2` | 8px | 元素内间隙 |
| `--mb-s-3` | 12px | 列表项内间距 |
| `--mb-s-4` | 16px | 组件内边距 |
| `--mb-s-5` | 24px | 大间距（浮层内边距、侧栏区块）；**卡内边距 / 区块间距见 §5，不用本档** |
| `--mb-s-6` | 32px | 页面级间距 |
| `--mb-s-7` | 48px | 空状态上下留白 |

基准 4px。出现 5px、7px、10px 这类值说明是「量出来的」而不是「设计出来的」。

---

## 5. 密度档位

**单档（v0.6 取消紧凑档）**：不再有 `[data-density="compact"]`，避免两套密度各自漂移。

| Token | 值 |
|---|---|
| `--mb-row-py` | 10px |
| `--mb-row-gap` | 10px |
| `--mb-card-pad` | 20px |
| `--mb-card-pad-compact` | 12px——快照卡、账户入口等紧凑卡 |
| `--mb-tbl-py` | 4px |
| `--mb-tbl-row-h` | `calc(fs-1 + s-4)`（默认 13+16 = 29px）——**所有数据表**（并排与单表）的单行固定高度；超长内容截断/展开不改行高 |
| `--mb-tbl-line-h` | `calc(tbl-row-h - tbl-py * 2 - border)`（默认 20px）——表格行内统一行高 |
| `--mb-tbl-w-main` | `2.4`（相对权重，非绝对值）——首列：名称 / 分类 / 项目 |
| `--mb-tbl-w-mid` | `1.6`——性质 / 账户 / 说明 |
| `--mb-tbl-w-date` | `1.6`——日期 / 账户（同一列位） |
| `--mb-tbl-w-num` | `1.1`——金额 / 占比 / 比率 |
| `--mb-control-h` | 38px |
| `--mb-section-gap` | 16px |
| `--mb-page-pad` | 28px（PC）/ 26px（移动端） |

密度只通过这一组变量表达，不逐处改数值——逐处改是密度档位最终失控的原因。

**表格列宽**：按列语义给权重（首列名称/分类最宽，日期、中列、数字列依次收窄），
由 `colgroup` 把权重折算成百分比，配合 `table-layout: fixed` 生效——不写固定 px 列宽，
也不允许每张表各写一套。超长文本由 `ellipsis` 截断，全文走 tooltip（见
[interaction-spec §5.3](interaction-spec.md)）。

**行高优先规则**：表格行固定 29px 优先于字号；列表金额用 `--mb-fs-2`（14px）配
`--mb-tbl-line-h`（20px），分类图标 20px，不通过缩放字号或图标撑高行。

---

## 6. 圆角

| Token | 值 | Mantine 键 | 用途 |
|---|---|---|---|
| `--mb-radius-xs` | 6px | `xs` | 输入框、小图标按钮 |
| `--mb-radius-sm` | 10px | `sm` | 按钮、chip、行内元素 |
| `--mb-radius-md` | 14px | `md` | **默认**：卡片、面板 |
| `--mb-radius-lg` | 20px | `lg` | 主卡、弹层、移动端抽屉顶部 |

胶囊形（`999px`）只用于 chip、tag、batch-bar 这类「有明确胶囊语义」的元素。
`theme.radius = { xs: '6px', sm: '10px', md: '14px', lg: '20px', defaultRadius: 'md' }`。

---

## 7. 阴影

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--mb-sh-1` | `0 1px 2px rgba(20,22,26,.05), 0 8px 24px rgba(20,22,26,.06)` | `0 1px 0 rgba(255,255,255,.03), 0 10px 28px rgba(0,0,0,.45)` | 卡片静止态、悬停微抬 |
| `--mb-sh-2` | `0 2px 6px rgba(20,22,26,.07), 0 16px 40px rgba(20,22,26,.09)` | `0 2px 0 rgba(255,255,255,.04), 0 20px 46px rgba(0,0,0,.55)` | 弹层、悬浮操作条 |
| `--mb-sh-3` | `0 4px 12px rgba(20,22,26,.09), 0 32px 64px rgba(20,22,26,.12)` | `0 8px 20px rgba(0,0,0,.55), 0 40px 80px rgba(0,0,0,.6)` | 时间选择面板等浮层 |

双层：**低透明度大扩散 + 高透明度小收紧**，不用单层大模糊——后者在浅灰面上会显脏。
暗色靠「顶亮线 + 大黑晕」表达层次，不额外加边框。上面的 `rgba()` 只允许出现在
token 定义文件（生成 CSS）；业务代码写 `var(--mb-sh-*)`。

HF 批次 1 起，暗色卡片**移除边框**，只用上述阴影与底色分层。
主卡按主题切换层级：**浅色 = 普通卡片同款**（`surface-raised` + `border` + `--mb-sh-1`，靠整行宽度与字号做最高层级），
**暗色 = 比 `surface-raised` 高一档**（`#1D2226`）+ 1px `hero-line` 高光边，保证与普通卡片可辨。

---

## 8. 字体

```css
--mb-font-ui:"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
--mb-font-display:"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif;  /* 同 UI，无衬线 */
--mb-font-num:"JetBrains Mono","Cascadia Mono",Consolas,ui-monospace,monospace;
```

- `--mb-font-ui`：正文与 UI
- `--mb-font-display`：标题——**与 UI 同栈**，不要衬线；12–14px 高密度下衬线会糊
- `--mb-font-num`：所有金额与数字，配 `font-variant-numeric: tabular-nums`

**字体现状**：仓库**不自托管**任何 woff2/woff/ttf，字体全部回落系统字。
Windows 上 `Inter` / `JetBrains Mono` / `Cascadia Mono` / `PingFang SC` 均不存在，
实际落到 **Microsoft YaHei**（正文/标题）与 **Consolas**（数字）；macOS 落 PingFang SC，
Linux 落 system-ui / 等宽默认。若要求跨平台一致，需要先引入自托管字体（另行决策）。

---

## 9. 动效

| Token | 值 | 用途 |
|---|---|---|
| `--mb-dur-1` | 150ms | 悬停、颜色变化 |
| `--mb-dur-2` | 280ms | 弹层进出、列表入场 |
| `--mb-ease` | `cubic-bezier(.22,.8,.32,1)` | 统一缓动 |

**过渡只对颜色、阴影、边框、透明度生效**——不对 `width`/`height`/`top` 做过渡
（会引发布局抖动）。

尊重 `prefers-reduced-motion: reduce`：命中时全部动画与过渡降到 0.01ms。

---

## 10. 触控目标

`--mb-touch: 44px`。移动端所有可点击元素的最小边长。
桌面端图标按钮可小于此值，但移动端不行——见 [platform-design.md](platform-design.md) §7。

---

## 11. 焦点环

```css
:focus-visible{outline:2px solid var(--mb-color-focus);outline-offset:2px;border-radius:var(--mb-radius-xs)}
```

统一 2px + 2px 偏移，不逐组件自定义。`--mb-color-focus` 与 `accent` 同值：
浅色 `#356B0C`（5.49）、暗色 `#A3E635`（11.71）。

---

## 12. 选用规则（速查）

| 要表达 | 用 | 不要用 |
|---|---|---|
| 主文字 | `--mb-color-text-primary` | 纯黑 / 纯白 |
| 次要说明 | `--mb-color-text-secondary` | text-primary 降透明度 |
| 辅助 / 元信息 | `--mb-color-text-tertiary` | text-secondary 降透明度 |
| 收入金额 | `--mb-color-income` | 泛称「绿色」 |
| 支出金额 | `--mb-color-expense`（≥24px 或 ≥18.66px 粗用 `expense-display`） | 橙色、正红 |
| 转账金额 | `--mb-color-transfer` | 中性灰（会读成「无意义」） |
| 分类区分 | `--mb-color-cat-*` | 语义色（会读成收入/支出） |
| 预算 80–100% | `--mb-color-warning` | `--mb-color-cat-*`（分类色不得当状态色） |
| 强调文字 / 图标 / 链接 | `--mb-color-accent` | `accent-fill` 当文字（1.39） |
| 强调填充 | `--mb-color-accent-fill` + `on-accent-fill` + 1px 描边 | 白字（1.51） |
| 危险动作 | `--mb-color-danger` + 图标 + 文案 + 二次确认 | 普通提示、警告 |
| 分隔线 | `--mb-color-border` | `border-strong`（后者用于输入边框） |
| 卡片 | `--mb-color-surface-raised` + `border` + `--mb-sh-1` | 纯白 + 纯灰边框 |
| 最高层级主卡 | 浅色 `surface-raised`；暗色 `hero-bg` 高一档（值见 §2.1） | 浅色深底反白（破坏主题一致性） |
| 填充按钮上的文字 | `--mb-color-on-accent-fill`（`#0D1005`） | `#FFF` |
| 危险实心上的文字 | `--mb-color-on-danger` | `#FFF` |
| 遮罩 | `--mb-color-surface-overlay` | 裸 `rgba(0,0,0,.x)`（不随主题） |

**半透明叠加一律用 `color-mix(in srgb, var(--mb-x) N%, transparent)`**，
不写 `rgba()` 字面量——后者无法随主题变化。

---

## 13. 落地检查（段三自查）

```bash
# 1. 间距字号无字面量
grep -rnE "fontSize:|font-size:\s*[0-9]|padding:\s*[0-9]|margin:\s*[0-9]|gap:\s*[0-9]" apps/web/src --include=*.tsx --include=*.css

# 2. 无硬编码颜色（token 定义文件本身除外；rgba( 一并算字面量）
grep -rnE "#[0-9a-fA-F]{3,6}|rgba?\(" apps/web/src --include=*.tsx --include=*.css \
  | grep -v "var(--mb-" | grep -v "styles/theme/"

# 3. 无内联样式
grep -rn "style={{" apps/web/src --include=*.tsx

# 4. transition 只作用于颜色类属性
grep -rn "transition:all" apps/web/src --include=*.css --include=*.tsx

# 5. 焦点可见
grep -rn ":focus-visible" apps/web/src --include=*.css

# 6. 半透明叠加走 color-mix，不写 rgba 字面量
grep -rn "rgba(" apps/web/src --include=*.tsx --include=*.css | grep -v "styles/theme/"
```

六条命令对应 R2–R3 与 U12 的验收项。**出现即返工**——这是 §「规则」一节的执行方式。

> `styles/theme/` 下的 token 定义文件是**唯一**允许出现色值字面量的地方（它就是字面量的收口处）。
> 其余任何位置（包括内联 `style`、图表配置、ECharts 配色）都必须引用 `var(--mb-*)`。
