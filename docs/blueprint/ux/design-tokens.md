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
| 数字 | 与正文同一字体栈 + `tabular-nums`（全站 `body` 继承启用） | 单一字体栈；金额按列宽对齐，不再用等宽族 |
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
| `--mb-color-warning` | `#8A5A00` | `#E5B54A` | 预算 80–100% 预警（仅文字；条面见 §2.7） |

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
  分类色只用于分类图标与标签底色，不再用于图表填充（图表见 §2.8）。
- `--mb-chart-series-1` … `-7`：浅色最低 **3.22**（`-7` `#8C9188`），暗色最低 **5.53**。
  只用于图表填充，对卡片底 `#FFFFFF` / `#16191B` 均 ≥3:1。
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

`--mb-color-cat-1` … `-6`：**只用于分类图标与标签底色，退出图表填充**
（环形、堆叠条、桑基改用 §2.8 的 `--mb-chart-series-*`）。
`cat-*` 只有 6 槽，装不下「Top 6 + 其余」；且暗色 `cat-1` 等于 `accent-fill`，
当图表填充会被读成「选中」。

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

### 2.7 进度条填充（面 / 字分离）

用户原话「文字这套颜色不适合作为进度条」：条面不再引用 `accent` / `expense` 等文字色，
改用独立填充档。条面颜色独立于文字色，**提高彩度而不是压暗**，与轨道保持 ≥3:1 的明度差；
这些 token **只用于条面，不用于任何文字**。轨道固定
`--mb-color-border-strong`（浅 `#CBCEC8` / 暗 `#333A3F`），条高 **6px**、圆角、**无描边**。
填充属图形，验收阈值是**对轨道 ≥3:1**（不参与正文 4.5 门槛）。

| Token | 浅色 | 暗色 | 浅色对轨道 | 暗色对轨道 | 含义 |
|---|---|---|---|---|---|
| `--mb-progress-normal` | `#425B70` | `#8EA8BF` | 4.46 | 4.68 | 计划内（支出未到临界 / 收入未达成） |
| `--mb-progress-warning` | `#A65700` | `#EEA743` | 3.31 | 5.64 | 接近上限（支出 80–100%） |
| `--mb-progress-over` | `#A5292D` | `#ED6869` | 4.47 | 3.73 | 超支（支出 >100%） |
| `--mb-progress-achieved` | `#106C3E` | `#60C68F` | 4.08 | 5.49 | 达成（收入 ≥100%，收入方向专属） |

**超支表现（0–130% 刻度）**：轨道统一 `--mb-color-border-strong`，不再有
`surface-sunken` 溢出区。100% 预算位在 **76.9231%**，此处画一条 **2px 宽、与轨道同色**
的竖缺口；`percent < 100` 时它落在空轨道上不可见，`percent = 100` 时条面停在缺口左侧，
`percent > 100` 时条面**连续跨过缺口**、被切出一段空隙。溢出超过 130% 钳在轨道右端。
条面与文字解耦后，文字规则回到文字体系：名称恒 `primary`，`normal` / `achieved` /
`neutral` 的状态文字 `secondary`，只有 `warning` / `over` 用语义色并带图标
（见 [interaction-spec §6.2](interaction-spec.md)）。收入未达成用 `normal`，不用 `warning`。

### 2.8 图表序列色（7 槽）

图表填充统一用 `--mb-chart-series-1` … `-7`：环形、堆叠条、桑基共用同一序列表，
按金额从大到小取槽。`cat-*` 只留分类图标，**退出图表填充**（理由见 §2.6）。

| Token | 浅色 | 暗色 | 浅色对白卡 | 暗色对暗卡 |
|---|---|---|---|---|
| `--mb-chart-series-1` | `#1B6FA8` | `#6FA8DC` | 5.40 | 6.99 |
| `--mb-chart-series-2` | `#C25E00` | `#E08A3C` | 4.29 | 6.62 |
| `--mb-chart-series-3` | `#0C7A80` | `#45C9C0` | 5.11 | 8.72 |
| `--mb-chart-series-4` | `#6B4FD1` | `#A78BFA` | 5.73 | 6.49 |
| `--mb-chart-series-5` | `#8A7A0A` | `#D6C24A` | 4.31 | 9.82 |
| `--mb-chart-series-6` | `#C24A8A` | `#E86FB2` | 4.53 | 6.18 |
| `--mb-chart-series-7` | `#8C9188` | `#8A9196` | 3.22 | 5.53 |

规则：

- **一张图最多 7 个有色项**（6 个具名 + 1 个「其余 N 类」），第 8 类起并入「其余」；
  序列色只有 7 槽，复用颜色会让两块同色、被读成同一类。
- 「其余 N 类」块**必须斜纹 + 文字**（文字标签是主编码，颜色只是辅助）；
  暗色下 `-6` 玫 ↔ `-7` 灰在 deutan 下 ΔE 仅 6.5，不能只靠颜色。
- 相邻槽已按色盲 ΔE 排序；**不要再插入或调换槽位**，否则会破坏相邻可辨性。
- 这些 token **只用于图形填充**，不用于文字、图标底色或状态色；正文文字仍走 §2.1 文字档。

**二级环（子分类）同族明度阶梯**：进入二级时不重新分配 7 槽，而是在**父槽色相**上做明度阶梯，
保证父子视觉关联不断。公式（子分类按金额从大到小，`i` 为序号、`n` 为子分类数）：

```css
color-mix(in srgb, 父色 calc(var(--mb-chart-sub-from) + (var(--mb-chart-sub-to) - var(--mb-chart-sub-from)) * i / (n - 1)), var(--mb-chart-sub-tint))
```

| Token | 浅色 | 暗色 | 角色 |
|---|---|---|---|
| `--mb-chart-sub-from` | `72%` | `100%` | 阶梯起点：浅色从父色向深调，暗色从父色本身 |
| `--mb-chart-sub-to` | `100%` | `62%` | 阶梯终点：浅色回到父色，暗色向浅调 |
| `--mb-chart-sub-tint` | `#14161A` | `#FFFFFF` | 混色方向（深 / 浅） |

- 浅色向深调、末位回到父色：若向白调，最后几级对白卡会跌破 3:1。
- 暗色向浅调、父色最深：对暗底对比度只增不减。
- 子分类最多 **5 个 + 「其余 N 个」**（仍 ≤7 个有色项），第 6 个起并入「其余」。

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

字重只用 400 / 500 / 600（regular / medium / semibold）。

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
| `--mb-tbl-row-h` | `calc(fs-1 + s-4)`（默认 13+16 = 29px）——**仅报表数据表**的单行固定高度；超长内容截断/展开不改行高。**不约束流水列表与总览最近交易**（两者共用 54px 两段式行，见下） |
| `--mb-tbl-line-h` | `calc(tbl-row-h - tbl-py * 2 - border)`（默认 20px）——表格行内统一行高 |
| `--mb-tx-row-h` | 54px——流水列表与总览最近交易共用的两段式行（padding 8 + 主行 + 副行） |
| `--mb-tx-icon` | 26px——流水行首分类图标容器（字形 15px） |
| `--mb-bar-h` | 6px——预算进度条高度（预算页与总览预算卡共用） |
| `--mb-border-style-dashed` | `dashed`——流水分隔线与实现规格中的虚线语义（替代裸关键字） |
| `--mb-control-h` | 38px |
| `--mb-section-gap` | 16px |
| `--mb-page-pad` | 28px（PC）/ 26px（移动端） |

密度只通过这一组变量表达，不逐处改数值——逐处改是密度档位最终失控的原因。

**表格列宽**：按列语义给权重（首列名称/分类最宽，日期、中列、数字列依次收窄），
由 `colgroup` 把权重折算成百分比，配合 `table-layout: fixed` 生效——不写固定 px 列宽，
也不允许每张表各写一套。该规则只用于**报表数据表**；流水列表已改为两段式行，
不再使用表格列宽权重。超长文本由 `ellipsis` 截断，全文走 tooltip（见
[interaction-spec §5.3](interaction-spec.md)）。

**行高优先规则**：报表表格行固定 29px 优先于字号；列表金额用 `--mb-fs-2`（14px）配
`--mb-tbl-line-h`（20px），分类图标 20px，不通过缩放字号或图标撑高行。
流水列表与总览最近交易共用 54px 两段式行（`--mb-tx-row-h`），图标容器 26px，不受 29px 约束。

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

## 8. 字体栈与数字

```css
--mb-font-ui: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
--mb-font-display: var(--mb-font-ui);   /* 标题同栈，不要衬线 */
--mb-font-num: var(--mb-font-ui);       /* 数字同栈，靠 tabular-nums 对齐 */
```

- `--mb-font-ui`：正文与 UI，也是全站唯一字体栈
- `--mb-font-display`：标题——**与 UI 同栈**，不要衬线；12–14px 高密度下衬线会糊
- `--mb-font-num`：所有金额与数字——**与正文同族**，不再使用 JetBrains Mono / Consolas；
  数字等宽由 `font-variant-numeric: tabular-nums` 提供（在 `body` 上定义并全局继承）

**字号档位**：`fs-0…fs-6` = 12 / 13 / 14 / 16 / 20 / 28 / 40px，最小 12px，不得出现 10 / 11px（约束 HF 新壳；旧页处于冻结，其 11px 由旧页 token `--mb-font-size-mobile-label` 承载）。
**字重档位**：400 / 500 / 600（regular / medium / semibold），不得出现 700（同样约束 HF 新壳；旧页冻结不动）。

**字体现状**：仓库**不自托管**任何 woff2/woff/ttf，字体全部回落系统字。
Windows 上 `Inter` 不存在，实际落到 **Microsoft YaHei**；macOS 落 PingFang SC，
Linux 落 system-ui。若要求跨平台完全一致，需要先引入自托管字体（另行决策）。
正文、标题、数字三者必须同栈——**不允许**出现「金额用等宽族、正文用 UI 族」的第二套字体。

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

**例外 —— 卡片内行级元素**：流水行等卡片内可点击行受卡片 `overflow: hidden` 裁剪，
外偏移会被裁掉一半，因此允许 `outline-offset: calc(var(--mb-border-width) * -2)`（内偏移 2px）。
其余元素仍按上方 2+2。

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
| 预算计划内 | `--mb-progress-normal` | `--mb-color-accent`（绿色是收入语义） |
| 预算 80–100% 文字 | `--mb-color-warning` | `--mb-color-cat-*`（分类色不得当状态色） |
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
