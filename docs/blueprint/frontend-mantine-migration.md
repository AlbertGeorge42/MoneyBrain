# 前端 Mantine 8 迁移实现计划

> 计划文档，不包含实现。基线日期 2026-11-04。
> 设计输入：[ux/concept-design.md](ux/concept-design.md)（UX5a）、[ux/design-tokens.md](ux/design-tokens.md)（UX4）。
> 组件库结论：Mantine **8.3.18**（锁死，不用 `^`）。Mantine 9.x 要求 React 19，不在本次范围。

---

## 0. 结论摘要

**出口一句话**：`apps/web/src` 中 `antd` / `@ant-design/icons` import 归零、`--ant-*` 引用归零，页面只用 Mantine + `ui/` 自建业务组件，四张报表与记账流在 PC / 移动两端视觉对齐概念稿。

### 0.1 分期与总工作量

| 期 | 范围 | 文件 | 人日 |
|---|---|---|---|
| P0 | 主题骨架、Provider、图表取色、守卫改造 | 2 个 theme 文件 + `main.tsx` + `useNotify.ts` | 4–5 |
| P1 | 自建原语 12 项 + 流水 / 报表 / 预算 / 设置首屏 / 首页 | 35 个 antd 业务文件 + `Settings.tsx` | 35.5–46 |
| P2 | 投资 / 设置配置弹窗 / 公共组件 / 布局 | 26 个 antd 业务文件 + `MobileTabBar.tsx`（纯图标） | 10.5–14 |
| P3 | 删 AntD 依赖、守卫收口、全量回归 | — | 5–7 |
| **合计** | | **65 个 antd 文件 + 2 个无 antd 文件** | **55–72（中位约 63）** |

> 口径说明：任务里的「64 个文件」= 63 个 antd 业务文件 + `Settings.tsx`（无 antd import 但要重排）。
> 另有 2 个 theme 文件（`config.ts`、`chart-tokens.ts`）在 P0 迁移，`MobileTabBar.tsx` 只迁图标，不计入 64。

### 0.2 最贵的三项

| 排名 | 项目 | 人日 | 依据 |
|---|---|---|---|
| 1 | 时间条 + 统一时间面板 | 5–6 | 现有 `TimePickerField` 350 行 + `TimePickerMobile` 866 行，要合并成一套组件并落实 W6 九维度 + 双端宿主 |
| 2 | DataTable（分组表头 / 合计行 / 行折叠 / 列设置） | 3–4 | spike 约 150 行只覆盖前四项；生产版还需键盘、粘性表头、列显隐持久化、测试 |
| 3 | TreeSelect（账户 / 分类 / 移动目标） | 2.5–3 | 5 处使用，需递归树 + 搜索 + 当前位禁选 + 多选 + 键盘 |

### 0.3 三条硬前提

1. **锁版本**：所有 `@mantine/*` 固定 `8.3.18`；`package.json` 不出现 `^8`。
2. **同页面不混用**：一个页面及其子组件不得同时出现 antd 与 Mantine；共享组件先迁，再用它的页面迁。
3. **Token 单源**：颜色 / 字号 / 间距 / 圆角只来自 `styles/theme/tokens.ts`；组件与 CSS 只用 `--mb-*` 或 `theme.other`，不引用 `--mantine-*` 内部变量。

---

## 1. 目标与出口

### 1.1 量化出口

| 指标 | 基线（2026-11-04 实测） | 出口 |
|---|---|---|
| `from 'antd'` 文件数 | 65（含 2 个 theme 文件） | **0** |
| `@ant-design/icons` 文件数 | 31 | **0** |
| AntD 组件 / API 符号 | 41 个组件 + `theme` + 6 个类型名 | **0** |
| AntD 图标名 | 39 个 / 85 处 | **0** |
| `var(--ant-*)` 引用 | 0（U0 成果） | **0，且不得回升** |
| `--mantine-*` 在项目代码中的引用 | 0 | **0**（只允许出现在 `styles/theme/**`） |
| 使用 Mantine 的页面 | 0 / 5 | **5 / 5**（流水、报表、预算、设置、首页） |
| 四张报表双端视觉 | 现实现 | 对齐 W6 时间条 / 表尾合计 / 分组折叠 |
| 自建业务组件 | 0 | **12 项**（见 §4） |

### 1.2 非目标

- 不做 React 19 / Mantine 9 升级（P3 之后单独立项）。
- 不做虚拟滚动、固定列、列拖拽排序；触发条件见 §4。
- 不重写 `utils/timePicker.ts` 的纯日期函数；只换宿主组件。
- 不改后端、契约、数据库；前端只消费现有接口。
- 不做新旧双主题并存（旧 AntD 页面保持旧观感，直到该页迁完）。

---

## 2. 基础设施层（P0）

### 2.1 依赖与构建接线

| 包 | 版本 | 用途 | 注意 |
|---|---|---|---|
| `@mantine/core` | 8.3.18 | 组件、主题、CSS 变量 | 精确版本 |
| `@mantine/hooks` | 8.3.18 | `useMediaQuery` / `useDisclosure` 等 | 精确版本 |
| `@mantine/form` | 8.3.18 | 替换 AntD `Form` | 精确版本 |
| `@mantine/dates` | 8.3.18 | 表单里的日期输入 | 复用已装 `dayjs` |
| `@mantine/notifications` | 8.3.18 | 替换 `message` / `notification` | 精确版本 |
| `@mantine/dropzone` | 8.3.18 | 替换 `Upload.Dragger` | 备份导入需要拖放 |
| `postcss-preset-mantine` | 最新兼容 | Mantine 语法（`light-dark()` 等） | devDependency |
| `postcss-simple-vars` | 最新兼容 | Mantine 断点变量 | devDependency |

构建接线要点：

| 项 | 做法 |
|---|---|
| PostCSS | 新增 `postcss.config.cjs`：`postcss-preset-mantine` + `postcss-simple-vars`（断点 `xs`–`xl`） |
| 样式导入顺序 | `@mantine/core/styles.css` → `@mantine/dates/styles.css` → `@mantine/notifications/styles.css` → `@mantine/dropzone/styles.css` → 项目 `variables.css` / `reset.css` / `global.css` |
| AntD 样式 | 继续走 CSS-in-JS；P0 不删除 `antd`，P3 才卸载 |
| 语言 | `DatesProvider` 设 `locale: 'zh-cn'`，`firstWeekday: 1`；删除 `antd/locale/zh_CN` |
| 测试环境 | `tests/setup.ts` 补 `matchMedia` / `ResizeObserver` mock；RTL 渲染外包一层 `ThemeProvider` + `MantineProvider` |

### 2.2 主题骨架：单一事实来源

| 文件 | 动作 | 内容 |
|---|---|---|
| `apps/web/src/styles/theme/tokens.ts` | 新增 | 设计 token 常量、`buildMantineTheme(scheme)`、`buildCssVars(scheme)`、`getChartTokens(scheme)` |
| `apps/web/src/styles/theme/ThemeRoot.tsx` | 新增 | `ThemeProvider` + `MantineProvider` + `DatesProvider` + `Notifications` 组合 |
| `apps/web/src/styles/theme/config.ts` | 删除 | AntD `createThemeConfig` / `syncCssVars` 的 AntD 依赖版本被 `tokens.ts` 取代 |
| `apps/web/src/styles/theme/chart-tokens.ts` | 删除 | `useChartTokens` 改从 `tokens.ts` 取色 |
| `apps/web/src/styles/theme/financial-tokens.ts` | 删除 | 不再用 `@ant-design/colors` 派生；财务色直接写设计 token |
| `apps/web/src/styles/theme/mode.ts` | 删除 | 色彩模式交给 Mantine `data-mantine-color-scheme` |
| `apps/web/src/styles/ThemeContext.tsx` | 重写 | 保留公开 API（`mode/theme/isDark/setThemeMode/toggleTheme`），内部委托 `useMantineColorScheme` |
| `apps/web/src/styles/theme/variables.css` | 扩展 | 只放结构 token（字号 / 间距 / 圆角 / 阴影 / 字体 / 动效 / 触控）；颜色由 `syncCssVars()` 运行时写入 |
| `apps/web/src/styles/reset.css` | 修改 | `[data-theme='dark']` → `[data-mantine-color-scheme='dark']` |

**边界（哪些走 theme、哪些留 CSS 变量）**：

| 消费场景 | 来源 | 规则 |
|---|---|---|
| Mantine 组件内部状态（hover / active / focus / disabled / 默认边框） | `theme.colors` / `theme.radius` / `theme.shadows` | 只给 Mantine，不供业务代码读取 |
| 业务组件、CSS 文件、ECharts | `--mb-*` CSS 变量 | 精确设计值，随主题切换 |
| 业务 TS 代码需要取色 / 取间距 | `theme.other` | 不读 `theme.colors` 猜语义 |
| 页面内联样式 | 禁止 | 改用 `ui/` 组件或 CSS class |

**规则**：`tokens.ts` 是唯一允许色值字面量的文件；`variables.css` 只允许结构字面量。其余位置出现 `#hex` / `rgb()` 即返工（沿用 design-tokens §13 的自检命令）。

**命名过渡**：现状 CSS 使用旧名 `--mb-color-*`（27 个文件 / 203 处引用）。P0 由 `buildCssVars()` 以同一常量同时产出目标 `--mb-*` 与旧名别名，避免一次性改 27 个 CSS 文件；新代码只允许目标名，旧别名随对应页面迁移逐个删除，P3 清零。别名只存在于生成器与 CSS 引用，不写进设计文档，也不作为长期 API。

### 2.3 Mantine 颜色映射

#### 2.3.1 中性色阶（Mantine 组件内部消费）

浅色 `colors.gray`：

| 索引 | 值 | 角色 |
|---|---|---|
| 0 | `#FCFAF4` | 面板 |
| 1 | `#F5F2EA` | 页面底 |
| 2 | `#EDE9DE` | 下沉 / hover 底 |
| 3 | `#E2DCCC` | 分隔线 |
| 4 | `#C9C2AC` | 强边框（`--mantine-color-default-border`） |
| 5 | `#646B5C` | 辅助文字（ink-3） |
| 6 | `#59614F` | 次级文字（ink-2，`--mantine-color-dimmed`） |
| 7 | `#20261F` | 主文字（`theme.black` → `--mantine-color-text`） |
| 8 | `#171B15` | 深中性 |
| 9 | `#0F1411` | 最深 |

暗色 `colors.dark`：

| 索引 | 值 | 角色 |
|---|---|---|
| 0 | `#EDE9DB` | 主文字（`--mantine-color-text`） |
| 1 | `#C3CBBE` | 中性浅色 |
| 2 | `#A9B0A0` | 次级文字 / `--mantine-color-dimmed` |
| 3 | `#8D9585` | 辅助文字 |
| 4 | `#39443A` | 强边框（`--mantine-color-default-border`） |
| 5 | `#27302A` | 分隔线 / hover 底 |
| 6 | `#161D17` | 面板（Paper / 输入底） |
| 7 | `#0F1411` | **页面底（body 固定取 dark[7]）** |
| 8 | `#0C100D` | 更深中性（Mantine 内部消费） |
| 9 | `#080B09` | 最深 |

#### 2.3.2 品牌色阶（`colors.brand`）

| 索引 | 值 | 角色 |
|---|---|---|
| 0 | `#E1EDE2` | brand-soft 浅色 |
| 1 | `#C7E3D4` | 浅档 |
| 2 | `#9ADCB9` | brand-ink 暗色 |
| 3 | `#7CC9A2` | brand 暗色（`primaryShade.dark = 3`） |
| 4 | `#4EA57F` | 中间档 |
| 5 | `#2F7C5C` | 中间档 |
| 6 | `#1D5C43` | brand 浅色（`primaryShade.light = 6`） |
| 7 | `#17503A` | 深档 |
| 8 | `#0F3D2C` | brand-ink 浅色 |
| 9 | `#0A2E21` | 最深 |

主题键：`primaryColor: 'brand'`，`primaryShade: { light: 6, dark: 3 }`。

#### 2.3.3 语义单值与封皮 / 反色 / 图表色

**不进 `theme.colors`**，避免被 Mantine 组件当作可填充色（`color="income"` 之类）；统一放 `theme.other` + `--mb-*`。

| 设计角色 | 浅色 | 暗色 | `theme.other` | CSS 变量 |
|---|---|---|---|---|
| 收入 | `#177245` | `#74C693` | `financial.income` | `--mb-income` |
| 支出 | `#B5442C` | `#EE8B6F` | `financial.expense` | `--mb-expense` |
| 转账 | `#7A5C28` | `#D9A94E` | `financial.transfer` | `--mb-transfer` |
| 强调 / 预算警示 | `#806010` | `#D9A94E` | `financial.accent` | `--mb-accent` |
| 危险 | `#A93A24` | `#EE8B6F` | `financial.danger` | `--mb-danger` |
| 焦点 | `#1D5C43` | `#7CC9A2` | `financial.focus` | `--mb-focus` |
| 品牌深色 | `#0F3D2C` | `#9ADCB9` | `brandInk` | `--mb-brand-ink` |
| 品牌浅底 | `#E1EDE2` | `#1B2E24` | `brandSoft` | `--mb-brand-soft` |
| 收入底 | color-mix 12% | color-mix 12% | — | `--mb-income-bg` |
| 支出底 | color-mix 12% | color-mix 12% | — | `--mb-expense-bg` |
| 转账底 | color-mix 12% | color-mix 12% | — | `--mb-transfer-bg` |
| 封皮底 | `#0F3D2C` | `#1C3A2C` | `cover.bg` | `--mb-cover-bg` |
| 封皮主文字 | `#F2EFE4` | `#F2EFE4` | `cover.on` | `--mb-on-cover` |
| 封皮标签 | `#9ADCB9` | `#9ADCB9` | `cover.on2` | `--mb-on-cover-2` |
| 封皮说明 | `#C8E9D6` | `#C8E9D6` | `cover.on3` | `--mb-on-cover-3` |
| 封皮正向 | `#7CC9A2` | `#7CC9A2` | `cover.pos` | `--mb-on-cover-pos` |
| 封皮负向 | `#EE8B6F` | `#EE8B6F` | `cover.neg` | `--mb-on-cover-neg` |
| 封皮暖色 | `#D9A94E` | `#D9A94E` | `cover.warm` | `--mb-on-cover-warm` |
| 品牌实心块文字 | `#F5F2EA` | `#0F1411` | `onBrand` | `--mb-on-brand` |
| 反色浮层底 | `#20261F` | `#EDE9DB` | `inverse.bg` | `--mb-inv-bg` |
| 反色浮层文字 | `#F5F2EA` | `#161D17` | `inverse.ink` | `--mb-inv-ink` |
| 反色次级底 | `rgba(255,255,255,.12)` | `rgba(22,29,23,.10)` | `inverse.soft` | `--mb-inv-soft` |
| 反色次级 hover | `rgba(255,255,255,.22)` | `rgba(22,29,23,.20)` | `inverse.softHover` | `--mb-inv-soft-hover` |
| 反色强调 | `#7CC9A2` | `#177245` | `inverse.accent` | `--mb-inv-accent` |
| 遮罩 | `rgba(24,26,20,.45)` | 同值 | — | `--mb-veil` |
| 分类色 1–6 | 见下表 | 见下表 | `chart.cats[6]` | `--mb-cat-1..6` |

分类色板（文档值；与语义色重值的问题见下）：

| Token | 浅色 | 暗色 |
|---|---|---|
| `--mb-cat-1` | `#1D5C43` | `#7CC9A2` |
| `--mb-cat-2` | `#806010` | `#D9A94E` |
| `--mb-cat-3` | `#7A5C28` | `#C4A882` |
| `--mb-cat-4` | `#646B5C` | `#8D9585` |
| `--mb-cat-5` | `#177245` | `#74C693` |
| `--mb-cat-6` | `#B5442C` | `#EE8B6F` |

**设计冲突（必须在 P1 图表验收前解决）**：这 6 个值与 brand / accent / transfer / ink-3 / income / expense 完全相同，与同节「分类色必须无语义」自相矛盾。P0 先按文档值落位并保留独立 `cat` token；UX5b 需重新调 6 色，只改 `tokens.ts` 两组数组，页面不动。未解决则饼图 / 堆叠条的红色块会被读成「支出」，视为 P1 验收不通过。

**承载面 / 文本 / 线**的精确 CSS 变量与 Mantine 键：

| CSS 变量 | 浅色来源 | 暗色来源 | Mantine 键 |
|---|---|---|---|
| `--mb-bg` | `cssVariablesResolver.light` 覆写 `#F5F2EA` | `dark[7]`（`#0F1411`） | `--mantine-color-body` |
| `--mb-bg-panel` | `gray[0]` | `dark[6]` | `Paper` / `Card` 默认底，经 `theme.components` 设置 |
| `--mb-bg-sunken` | `gray[2]` | 精确 `#10160F`，走 CSS 变量 | `--mantine-color-default-hover` |
| `--mb-ink` | `theme.black = #20261F` | `dark[0]` | `--mantine-color-text` |
| `--mb-ink-2` | `gray[6]` | `dark[2]` | `--mantine-color-dimmed` |
| `--mb-ink-3` | `gray[5]` | `dark[3]` | 仅 CSS 变量 |
| `--mb-line` | `gray[3]` | `dark[5]` | 仅 CSS 变量 |
| `--mb-line-strong` | `gray[4]` | `dark[4]` | `--mantine-color-default-border` |
| `--mb-brand` | `brand[6]` | `brand[3]` | `--mantine-primary-color-filled` |

**暗色底精确值的处理**：

- 页面底必须精确 `#0F1411`，通过 `colors.dark[7]` 落位；P0 用浏览器计算值断言，不接受近似。
- 面板 / 下沉 / 分隔线优先用 `--mb-*` 精确值；Mantine 内部派生值（如 hover 档）允许近似，登记在 §7.3。
- 浅色 body 首选 `cssVariablesResolver.light` 覆写；若实测不生效，退路是 `theme.white = '#F5F2EA'`，同时把需要真白的地方改读 `theme.other.white = '#FFFFFF'`。二选一在 P0 结束前定稿。

#### 2.3.4 设计 token 缺口（必须显式补齐）

概念稿「原型覆盖的三处缺口」已登记三类缺口；其中两类直接落在本迁移的财务语义上：

| 现有语义 | 当前来源 | 设计 token 缺口 | P0 临时落点 | 定稿 |
|---|---|---|---|---|
| `refund`（退款） | `TRANSACTION_SEEDS` 橙色 | 无独立 token | `--mb-accent` | UX5b 决定是否新增 `--mb-refund` |
| `adjustment`（调账） | `TRANSACTION_SEEDS` 紫色 | 无独立 token | `--mb-ink-2`（中性） | UX5b 决定是否新增 `--mb-adjustment` |
| `cash`（现金） | `CASH_FLOW_SEEDS` 蓝色 | 无独立 token | `--mb-transfer` | UX5b 决定 |
| `non-cash`（非现金） | `CASH_FLOW_SEEDS` 青色 | 无独立 token | `--mb-ink-3` | UX5b 决定 |
| `investing`（投资） | `CASH_FLOW_SEEDS` 极客蓝 | 无独立 token | `--mb-brand` | UX5b 决定 |
| `positive` / `negative` / `neutral`（数值方向） | `VALUE_SEEDS` | 复用收入 / 支出 / 次级文字 | `--mb-income` / `--mb-expense` / `--mb-ink-2` | 直接复用 |

规则：

- 临时落点只允许出现在 `theme.other.financial` 与 `--mb-*`，业务组件不得写条件分支决定颜色。
- `TRANSACTION_TAG_PRESETS`（AntD 预设色名）在 P2 删除，由 `TypeBadge` 的语义枚举替代。
- UX5b 若新增正式 token，只改 `tokens.ts` 两行映射，页面不动；这是本表存在的意义。

#### 2.3.5 `cssVariablesResolver` 输出

| 变量 | 浅色 | 暗色 |
|---|---|---|
| `--mantine-color-body` | `#F5F2EA` | 不覆写（取 `dark[7]`） |
| `--mantine-color-default` | `#FCFAF4` | `#161D17` |
| `--mantine-color-default-hover` | `#EDE9DE` | `#27302A` |
| `--mantine-color-default-border` | `#C9C2AC` | `#39443A` |
| `--mantine-color-dimmed` | `#59614F` | `#A9B0A0` |
| `--mantine-color-text` | `#20261F` | `#EDE9DB` |

同时由 `buildCssVars()` 写入全部 `--mb-*`（颜色 + 阴影），`syncCssVars(scheme)` 在首屏渲染前调用一次，切换主题时再调用。

### 2.4 尺寸 / 圆角 / 间距 / 阴影 / 字体 / 断点

| 设计项 | Mantine 键 | CSS 变量 | 备注 |
|---|---|---|---|
| 圆角 6 / 10 / 16 / 24 | `theme.radius = { xs: '6px', sm: '10px', md: '16px', lg: '24px', xl: '24px' }` | `--mb-r-1..4` | 4 档正好落在标准键，不产生 `as any`；若 UX 新增第 5 档自定义键，cast 只允许出现在 `tokens.ts` |
| 默认圆角 | `defaultRadius: 'sm'`（10px） | — | 按钮 / chip 10px |
| 输入圆角 6px | `components.Input/Select/NumberInput/DatePickerInput.defaultProps.radius = 'xs'` | `--mb-r-1` | 逐组件设，不改默认 |
| 间距 4/8/12/16/24 | `theme.spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }` | `--mb-s-1..5` | 32 / 48 放 `theme.other.space.2xl/3xl` |
| 字号 12/13/14/16/20 | `theme.fontSizes = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20 }` | `--mb-fs-0..4` | 28 / 40 走标题 |
| 标题 40/28/20/16/14/13 | `theme.headings.sizes.h1..h6` | `--mb-fs-6/5/4/3/2/1` | 页面标题用 h2（28），净资产主卡用 h1（40） |
| UI 字体 | `theme.fontFamily = 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif'` | `--mb-font-ui` | 删除现有 `Avenir Next` 栈 |
| 标题字体 | `theme.headings.fontFamily = 'Noto Serif SC, Fraunces, serif'` | `--mb-font-display` | 标题「账本」质感 |
| 金额字体 | `theme.fontFamilyMonospace = 'IBM Plex Mono, Noto Sans SC, monospace'` | `--mb-font-num` | 金额与数字 `tabular-nums` |
| 字体加载 | 只声明字体栈，不新增 web font 网络请求 | — | 缺失时接受后备字体；视觉验收记录实际字体 |
| 阴影 3 档 | `theme.shadows.xs/sm/md` | `--mb-sh-1..3` | 只映射 3 档，不扩 |
| 断点 | `breakpoints.md = '53.75em'`（860px） | — | 只允许 `hiddenFrom="md"` / `visibleFrom="md"`，不引入第二套断点 |
| 触控 44px | 组件 `size="lg"` + 自定义 class | `--mb-touch` | 移动端所有可点击元素最小 44 |
| 密度 | `[data-density="compact"]` 换整套 CSS 变量 | `--mb-row-py` 等 | 不做逐处判断 |

### 2.5 暗色切换与 Provider

| 项 | 方案 |
|---|---|
| 色彩模式来源 | Mantine `data-mantine-color-scheme` 单一来源；删除自写 `data-theme` 写入 |
| 存储迁移 | 沿用 key `moneybrain-theme-mode`；首次读取时把 `system` 映射为 Mantine 的 `auto` |
| `ThemeContext` | 保留四个消费点（`mode/theme/isDark/setThemeMode/toggleTheme`），内部用 `useMantineColorScheme` + `useComputedColorScheme` |
| Provider 顺序 | `ThemeProvider` → `MantineProvider`（`theme` / `defaultColorScheme` / `cssVariablesResolver`）→ `DatesProvider` → `Notifications` → `QueryClientProvider` → `App` |
| 首屏防闪烁 | `main.tsx` 在 render 前读取存储模式并 `syncCssVars(scheme)`；Mantine 自身变量由 Provider 挂载时写入 |
| Toast 位置 | `Notifications position="top-center"`，移动端顶部横幅（Q2），与 PC 保持同一交互逻辑 |
| 语言 | `DatesProvider locale="zh-cn"`；删除 AntD `zhCN` |

### 2.6 `useChartTokens()` 取色源替换

| 项 | 现状 | 目标 |
|---|---|---|
| 取色 | `theme.useToken()`（AntD） | `useMantineTheme()` + `useComputedColorScheme('light', { getInitialValueInEffect: false })` |
| 财务色 | `@ant-design/colors` 派生 | `theme.other.financial` |
| 色板 | AntD 10 色（primary/cyan/green/gold/...） | `theme.other.chart.cats` 6 色（design-tokens §2.6） |
| 超过 6 类 | 循环用色 | 聚合为「其他」；沿用现金流「>6 聚合成其他」口径 |
| 文本 / 轴线 / tooltip | AntD token | `--mb-ink` / `--mb-ink-2` / `--mb-line` / `--mb-bg-panel` |
| ECharts 主题 | 无统一主题 | 新增 `getEchartsTheme(scheme)`；`BaseChart` 按 scheme 注册 `mb-light` / `mb-dark`，图表只消费 `ChartTokens` |
| 暗色切换 | 组件重渲染 | schema 变化触发 `useMemo` 重算并重建 option |

`ChartTokens` 接口收缩为：`text / textSecondary / textTertiary / axis / splitLine / legend / tooltip{bg,text,border} / palette[6] / financial`。删除所有 AntD token 字段。

### 2.7 P0 验收

| 检查 | 命令 | 通过标准 |
|---|---|---|
| 类型 | `npm run typecheck:web` | 0 错 |
| Lint | `npm run lint:web` | 0 错、0 新警告 |
| 单测 | `npm run test:web` | 全过；`css-vars-guard` 全过 |
| AntD 文件计数 | `(rg -l "from 'antd'" apps/web/src \| Measure-Object).Count` | **61**（65 → 61） |
| `--ant-*` | `rg -n "var\(--ant-" apps/web/src` | 0 命中 |
| Mantine 内部变量外泄 | `rg -n "--mantine-" apps/web/src --glob '!styles/theme/**'` | 0 命中 |
| 主题计算值 | `npx playwright test e2e/tests/theme.spec.ts --project=chromium-desktop` | 浅色 body `rgb(245,242,234)`；暗色 `rgb(15,20,17)`；`--mb-*` 全部有值；0 console error |
| 构建 | `npm run build -w @moneybrain/web` | 成功；记录首包 gzip 体积作为 P3 对照基线 |

P0 交付物：`tokens.ts`、`ThemeRoot.tsx`、重写后的 `ThemeContext.tsx`、`main.tsx`、`useNotify.ts`、扩展后的 `variables.css`、Mantine 版 `theme.spec.ts`。

---

## 3. 组件映射表

### 3.1 41 个 AntD 组件符号

| # | AntD 符号 | 用量 | Mantine 落法 | 迁移注意 |
|---|---|---|---|---|
| 1 | `Button` | 29 | `Button` / `ActionIcon` | 主按钮 `variant="filled"`、次按钮 `variant="default"`；高度 44（移动）/ 36（PC）；图标按钮用 `ActionIcon` 并保证 44 热区 |
| 2 | `Card` | 19 | `Paper` + `ui/SurfaceCard` | 统一 panel 底 / `--mb-line` / `--mb-sh-1` / 圆角 16；禁止裸 `Card` 写样式 |
| 3 | `Empty` | 16 | **自建** `EmptyState` | 文案 + 说明 + 可选动作；三档尺寸；用于列表、图表、配置树 |
| 4 | `Tag` | 14 | `Badge` + **自建** `TypeBadge` | 语义枚举 → token 映射（收入 / 支出 / 转账 / 退款 / 调账，见 §2.3.4），不用 Mantine 色名；圆角胶囊 |
| 5 | `Typography` | 13 | `Text` / `Title` | 字号只能走 `theme.fontSizes` 或 `--mb-fs-*`；删除 `Text type="secondary"`，改 `c="dimmed"` |
| 6 | `Form` | 13 | `@mantine/form` `useForm` + 受控字段 | 校验规则随字段；错误用 `ui/FormField`；不再用 `Form.Item` 布局 |
| 7 | `Modal` | 13 | `Modal` + **自建** `ResponsiveOverlay` | PC 弹窗；移动全屏二级页或底部 Sheet；禁止弹窗套弹窗 |
| 8 | `Space` | 10 | `Group` / `Stack` | 间距用 `gap="xs/sm/md/lg"`；禁止裸数字 |
| 9 | `Input` | 9 | `TextInput` / `Textarea` | 圆角 6；移动高度 44；前缀图标用 `leftSection` |
| 10 | `Skeleton` | 8 | `Skeleton` + `ui/LoadingBlock` | 骨架形状贴合真实布局；禁止整页转圈 |
| 11 | `Grid` | 8 | `SimpleGrid` / CSS grid | 现有 `grids.css` 可保留；不引入 Mantine 响应式第二套 |
| 12 | `Statistic` | 6 | **自建** `Metric` / `KpiCard` | 金额等宽数字；正负色走财务语义；预测值加 `PredictionPopover` |
| 13 | `Alert` | 6 | `Alert` | 语义色映射 danger / accent / brand；图标用 lucide；圆角 10 |
| 14 | `Segmented` | 6 | `Segmented` | 普通视图切换用它；**时间条粒度分段不用它**（W6 固定尺寸与 44 热区，走 `ui/time`） |
| 15 | `TreeSelect` | 5 | **自建** `TreeSelect` | 账户 / 分类 / 移动目标；递归树 + 搜索 + 禁选当前位 |
| 16 | `Table` | 5 | `Table`（简单表）/ **自建** `DataTable`（报表） | 配置类表格用 Mantine `Table`；报表表格复用现有 `ReportDetailList` 结构，补分组头 / 表尾合计 |
| 17 | `InputNumber` | 5 | `NumberInput` + `ui/CurrencyInput` | 金额以整数分提交；`decimalScale=2`；禁止浮点 |
| 18 | `DatePicker` | 5 | `DatePickerInput`（表单）/ **自建** `TimePanel`（报表） | 两个场景不混用；报表时间选择按 W6 |
| 19 | `Tabs` | 4 | `Tabs` | 配置弹窗内 Tab 用它；报表切 tab 按概念稿做成按钮行 |
| 20 | `App` | 4 | 删除 | 由 `useNotify` 接 Mantine `notifications`；撤销动作放通知内按钮 |
| 21 | `Divider` | 4 | `Divider` | 颜色 `--mb-line`；不额外写样式 |
| 22 | `Select` | 3 | `Select` / `Combobox` | 可搜索下拉用 `Combobox`；选项分组用 `Select` groups |
| 23 | `Dropdown` | 3 | `Menu` | 行尾 `⋯` 菜单；危险项 `color="red"` 但色值走 `--mb-danger` |
| 24 | `Switch` | 3 | `Switch` | 尺寸与标签用 `Group`；移动端 44 行高 |
| 25 | `Tooltip` | 3 | `Tooltip` | 只在信息不可见时用；触屏不承载关键信息 |
| 26 | `Progress` | 3 | `Progress` / `RingProgress` | 预算环形用 `RingProgress`；超支不封顶，文本显示真实百分比 |
| 27 | `Spin` | 3 | `Loader` / `Skeleton` | 页面加载用 Skeleton；短操作遮罩才用 Loader |
| 28 | `Radio` | 2 | `Radio.Group` | 删除确认 / 导入方式；与 Checkbox 统一行高 |
| 29 | `Result` | 2 | **自建** `ResultState` | 错误页显示原因 + requestId + 重试（不渲染 0） |
| 30 | `Row` | 2 | `SimpleGrid` / CSS | 与 `Col` 一起替换；不保留 AntD 栅格 |
| 31 | `Col` | 2 | `SimpleGrid` / CSS | 同上 |
| 32 | `Popover` | 2 | `Popover` | 预测说明 / 图标取色；`withinPortal` 保持 |
| 33 | `Drawer` | 2 | `Drawer` + **自建** `Sheet` | PC 抽屉；移动底部抽屉圆角 24、把手 44 |
| 34 | `Checkbox` | 2 | `Checkbox` | 批量选择；行主体点选与复选框分工按概念稿 |
| 35 | `Layout` | 1 | 删除 | `MainLayout` 用 CSS grid + `Paper` + `NavLink`；不用 `AppShell` 避免第二套断点 |
| 36 | `Collapse` | 1 | `Collapse` / `Accordion` | 筛选面板；动画尊重 `prefers-reduced-motion` |
| 37 | `Menu` | 1 | `NavLink` + `Stack` | PC 侧栏导航；当前项用品牌浅底 + 左侧标记 |
| 38 | `ConfigProvider` | 1 | `MantineProvider` | 见 §2.5；删除 `locale` |
| 39 | `Popconfirm` | 1 | **自建** `ConfirmDialog` | 回滚点删除；两步确认视觉统一 |
| 40 | `List` | 1 | `List` / `Stack` | 预算用量列表可改 `Stack` 行组件 |
| 41 | `Upload` | 1 | `@mantine/dropzone` + **自建** `UploadBox` | 备份导入拖放；显示文件名 / 大小 / 进度 / 错误 |

**`theme` API（35 个文件导入，其中 34 个调用 `theme.useToken()`，另 1 个是 `config.ts`）**：删除 `theme.useToken()`。间距 / 圆角读 `theme.other` 或 CSS 变量；颜色读 `theme.other.financial / chart / cover`。**禁止**在业务组件里读 `theme.colors` 猜语义。

### 3.2 6 个类型 / API-only 符号

| AntD 名 | 用量 | 替换 |
|---|---|---|
| `MenuProps` | 4 | Mantine `MenuProps` 或自定义 `MenuActionItem[]` |
| `FormInstance` | 2 | `UseFormReturn`（`@mantine/form`） |
| `TreeSelectProps` | 2 | 自建 `TreeSelectProps` |
| `ThemeConfig` | 1 | `MantineThemeOverride` |
| `InputRef` | 1 | `React.ComponentRef<typeof TextInput>` |
| `TabsProps` | 1 | Mantine `TabsProps` |

### 3.3 文件分批归属

#### P0（4 个文件，2 theme + 2 业务）

| 文件 | 行数 | 动作 |
|---|---|---|
| `styles/theme/config.ts` | 148 | 删除，逻辑并入 `tokens.ts` |
| `styles/theme/chart-tokens.ts` | 58 | 删除，逻辑并入 `tokens.ts` |
| `main.tsx` | 59 | 换 `MantineProvider` + `Notifications` |
| `hooks/useNotify.ts` | 18 | 换 Mantine notifications |

#### P1（35 个 antd 文件 + `Settings.tsx`）

| 批次 | 文件 | 文件数 | 行数 |
|---|---|---|---|
| 流水 | `pages/Transactions.tsx`、`queries/transaction.tsx`、`components/transactions/*`（9 个） | 11 | 2216 |
| 报表 | `pages/Reports.tsx`、`components/reports/*`（8 个）、`components/charts/*`（3 个） | 12 | 3045 |
| 预算 | `pages/Budgets.tsx`、`components/budgets/*`（4 个） | 5 | 1071 |
| 设置首屏 | `Settings.tsx`（无 antd）、`ReportConfigSection`、`ThemeSection`、`DataBackupSection`、`AutoBackupSection`、`RecycleBinSection`、`DangerZoneSection` | 7（6 antd） | 890 |
| 首页 | `pages/Dashboard.tsx` | 1 | 401 |

#### P2（26 个 antd 文件 + `MobileTabBar.tsx`）

| 批次 | 文件 | 文件数 | 行数 |
|---|---|---|---|
| 投资 | `components/investment/*`（6 个） | 6 | 1446 |
| 设置配置弹窗 | `InvestmentAssetClassConfigModal` 之外的 settings 配置：`TransactionConfigModal`、`CashFlowConfigModal`、`AccountConfigModal`、`AccountForm`、`CategoryForm`、`ConfigModalLayout`、`MoveModal`、`DeleteConfirmModal`、`sortable`、`treeTypes`、`RollbackPointList` | 11 | 1277 |
| 公共组件 | `AccountSelect`、`CategorySelect`、`ErrorState`、`ErrorBoundary`、`IconColorField`、`ResponsiveDrawer`、`TimePickerField`、`TimePickerMobile` | 8 | 1983 |
| 布局 | `MainLayout.tsx`（antd）+ `MobileTabBar.tsx`（纯图标） | 2 | 97 |

> `TimePickerField` / `TimePickerMobile` 不逐行迁移：由 `ui/time/TimeBar + TimePanel` 替换后删除。
> `queries/transaction.tsx` 里的撤销按钮同时迁出查询层，改为 `ui/UndoToast`（D4 的「查询层不含 UI」）。

**计数结算**：P0 后 antd 文件 61；P1 后 26；P2 后 0。P2 同时清零图标文件 31。

---

## 4. 自建组件清单

统一放 `apps/web/src/ui/`，按 D4 的 feature 切片公开入口引用；不放桶导出（决策 #39 / dev-guide）。

| # | 组件 | 替代 | 接口要点 | Mantine 原语 | 人日 |
|---|---|---|---|---|---|
| 1 | `ui/DataTable` | AntD `Table`（报表部分） | `columns[{key,header,align,width,render,sortable}]`、`rows`、`getRowKey`、`groups`（分组表头）、`footer`（合计行）、`expandedKeys/onExpandedChange`（行折叠）、`columnVisibility` + `columnOrder`（列设置：显隐 + 上下移）、`stickyHeader`、`emptyState` | 原生 `<table>` + `ScrollArea` + `Checkbox` / `Menu` | 3–4 |
| 2 | `ui/TreeSelect` | AntD `TreeSelect` | `data`、`value/onChange`、`searchable`、`multiple`、`disabledKeys`、`filterMode('tree'\|'leaf')`、`renderNode`、`placeholder`、`size` | `Popover` + `TextInput` + `Tree` + `ScrollArea` | 2.5–3 |
| 3 | `ui/time/TimeBar` + `TimePanel` | AntD `DatePicker` / `Segmented` / 自写时间控件 | `semantics('point'\|'range')`、`granularity('day'\|'month'\|'year')`、`value`、`onChange`、`presets`、`onStep`、`onGranularityChange`；面板草稿制、起止两步、边界校验、预设 × 粒度矩阵 | `Popover`（PC）/ `Sheet`（移动）+ `UnstyledButton` + `Group` | 5–6 |
| 4 | `ui/Sheet` | 移动端底部抽屉 | `opened/onClose`、`title`、`children`、`height`、`handle`（44px 热区）、`closeOnOverlay`；顶部圆角 24 | `Drawer position="bottom"` + 自定义 content 样式 | 1–1.5 |
| 5 | `ui/EmptyState` / `LoadingBlock` / `ResultState` | AntD `Empty` / `Skeleton` / `Result` | `icon/title/description/action`；`rows/columns` 骨架；`code/requestId/retry` 错误态 | `Stack` / `Skeleton` / `Alert` / `Button` | 1–1.5 |
| 6 | `ui/UploadBox` | AntD `Upload.Dragger` | `accept`、`maxSize`、`multiple`、`onFiles`、`progress`、`error`、`disabled`；拖放与点选同热区 | `@mantine/dropzone` + `Progress` | 1.5–2 |
| 7 | `ui/Metric` / `KpiCard` | AntD `Statistic` | `label`、`value`（分）、`delta`、`tone('income'\|'expense'\|'neutral')`、`unit`、`loading`；`tabular-nums` | `Text` + `Paper` + `Skeleton` | 1–1.5 |
| 8 | `ui/TypeBadge` / `CountBadge` | AntD `Tag` / 计数徽标 | `type`（收入/支出/转账/退款/调账/现金流属性）、`count`、`tone`、`size` | `Badge` + CSS 变量 | 0.5–0.75 |
| 9 | `ui/FormField` / `CurrencyInput` | AntD `Form.Item` / `InputNumber` | `label/description/error/required`；金额整数分、显示千分位、允许负号；`FormSection` 统一间距 | `@mantine/form` + `NumberInput` + `Text` | 1.5–2 |
| 10 | `ui/ResponsiveOverlay` / `ConfirmDialog` | AntD `Modal` / `Drawer` / `Popconfirm` | PC 弹窗 / 抽屉；移动全屏或 Sheet；`danger`、`confirmText`、`cancelText`、`onConfirm`、两步确认 | `Modal` / `Drawer` / `Sheet` + `Button` | 1–1.5 |
| 11 | `ui/Icon`（映射与尺寸约定） | AntD 图标 | 39 个 AntD 名 → lucide 组件；默认 `size=16`、`strokeWidth=1.75`、`currentColor`；导航 20 / 主卡 22 | `lucide-react` | 0.5 |
| 12 | `ui/UndoToast` + `useNotify` 桥 | AntD `message` / `notification` | `success/error/warning/info/loading/open`；撤销按钮 6s 独立闭包；顶部横幅 | `@mantine/notifications` | 0.5 |

**合计 19–25 人日。**

### 4.1 明确不做的能力

| 能力 | 结论 | 触发条件 |
|---|---|---|
| 虚拟滚动 | 不做 | 单表 > 200 行且实测卡顿 |
| 固定列 | 不做 | 报表列数 > 8 且横向滚动成为主路径 |
| 列拖拽排序 | 不做 | 用户明确要求拖拽；先用上下移按钮 |
| 表格列宽拖拽 | 不做 | 同上 |
| Sheet snap 多段停靠 | 不做 | 移动端出现「半屏与全屏都要停留」的实际场景 |
| 完整 i18n 框架 | 不做 | 真要第二种语言（决策 #14 / L 类条目） |

---

## 5. 图标迁移

### 5.1 39 个图标映射

| AntD 图标 | 次数 | lucide | 备注 |
|---|---|---|---|
| `SettingOutlined` | 8 | `Settings` | 1:1 |
| `PlusOutlined` | 7 | `Plus` | 1:1 |
| `RightOutlined` | 6 | `ChevronRight` | 1:1 |
| `DeleteOutlined` | 6 | `Trash2` | 1:1 |
| `EditOutlined` | 5 | `Pencil` | 1:1 |
| `LeftOutlined` | 3 | `ChevronLeft` | 1:1 |
| `TransactionOutlined` | 3 | `ReceiptText` | 语义重选（导航「流水」） |
| `ExclamationCircleOutlined` | 3 | `CircleAlert` | 1:1 |
| `DashboardOutlined` | 2 | `LayoutDashboard` | 1:1 |
| `ArrowUpOutlined` | 2 | `ArrowUp` | 1:1 |
| `HistoryOutlined` | 2 | `History` | 1:1 |
| `RollbackOutlined` | 2 | `Undo2` | 1:1（回滚 / 撤销） |
| `BarChartOutlined` | 2 | `ChartColumn` | 图标名换代，语义一致 |
| `ControlOutlined` | 2 | `SlidersHorizontal` | 1:1 |
| `SwapOutlined` | 2 | `ArrowLeftRight` | 1:1 |
| `ArrowDownOutlined` | 2 | `ArrowDown` | 1:1 |
| `WalletOutlined` | 2 | `Wallet` | 1:1 |
| `DownOutlined` | 2 | `ChevronDown` | 1:1 |
| `ArrowLeftOutlined` | 2 | `ArrowLeft` | 1:1 |
| `CalendarOutlined` | 2 | `CalendarDays` | 1:1 |
| `ExportOutlined` | 2 | `MoveRight` | **无 1:1**：AntD 的 export 图形在此处语义是「移动到…」，用 `MoveRight` |
| `DesktopOutlined` | 1 | `Monitor` | 1:1 |
| `SunOutlined` | 1 | `Sun` | 1:1 |
| `MoonOutlined` | 1 | `Moon` | 1:1 |
| `AccountBookOutlined` | 1 | `BookOpen` | 1:1 |
| `MinusOutlined` | 1 | `Minus` | 1:1 |
| `CreditCardOutlined` | 1 | `CreditCard` | 1:1 |
| `InboxOutlined` | 1 | `Inbox` | 1:1 |
| `RedoOutlined` | 1 | `RotateCcw` | **无 1:1**：此处语义是「还原」，不是「重做」 |
| `RestOutlined` | 1 | `ArchiveRestore` | **无 1:1**：回收站标题，用归档恢复语义 |
| `UnorderedListOutlined` | 1 | `List` | 1:1 |
| `AppstoreOutlined` | 1 | `LayoutGrid` | **无 1:1**：此处是云同步目录警告，P2 改 `CloudAlert` 更准确 |
| `DownloadOutlined` | 1 | `Download` | 1:1 |
| `FolderAddOutlined` | 1 | `FolderPlus` | 1:1 |
| `HolderOutlined` | 1 | `GripVertical` | 1:1 |
| `CheckCircleOutlined` | 1 | `CircleCheck` | 1:1 |
| `BankOutlined` | 1 | `Landmark` | 1:1 |
| `FileTextOutlined` | 1 | `FileText` | 1:1 |
| `FundOutlined` | 1 | `ChartLine` | 1:1（投资分析） |

**无一对一替代的 4 项**：`ExportOutlined`、`RedoOutlined`、`RestOutlined`、`AppstoreOutlined`。按业务语义重选，不按字形硬套。

### 5.2 图标约定

| 项 | 规则 |
|---|---|
| 尺寸 | 列表 / 行内 16；导航 20；主卡 22；空态 32 |
| 线宽 | `strokeWidth=1.75`；大图标可 1.5 |
| 颜色 | `currentColor`，由父级文字色或 `--mb-*` 决定 |
| 装饰图标 | `aria-hidden`；纯图标按钮必须有 `aria-label` |
| 导入 | 从 `lucide-react` 具名导入，保持 tree-shaking；不建全量映射对象 |

---

## 6. 分期与顺序

### 6.1 总体顺序

```text
P0 主题骨架
  ├─ D4 页面瘦身 / feature 切片（可与 P0 并行）
  └─ UX5b（用 P0 主题 + ui/ 原语产可运行页面；前置是 UX5a 确认）
        ↓ 两条都完成
P1 原语 + 高流量页面 → P2 其余页面 → P3 删 AntD + 全量回归
```

> P0 是 UX5b 的前置，不是反过来的。UX5b 的页面直接复用 `tokens.ts` 与 `ui/`，不手写第二套 HTML/CSS 高保真。

### 6.2 各期进入条件 / 交付物 / 验收

| 期 | 进入条件 | 交付物 | 验收命令 / 人工检查 |
|---|---|---|---|
| P0 | 无（可立即开始） | 主题、Provider、图表取色、通知桥、守卫改造 | §2.7 全部；`typecheck:web`、`lint:web`、`test:web`、`build` |
| P1 | P0 完成；D4 完成（页面 < 200 行）；该页对应的 UX5b 高保真原型已确认（按页进入，不一次等全部） | 12 项原语按页面批次交付 + 流水 / 报表 / 预算 / 设置首屏 / 首页 | 每批后 antd 计数递减（61 → 26）；`npm run test:web`；`npx playwright test --project=chromium-desktop --project=mobile`；1440×900 / 390×844 截图对照原型 W1 / W2 / W5 / W6 / W7 |
| P2 | P1 完成；剩余 26 个 antd 文件 | 投资、配置弹窗、公共组件、布局、图标收口 | antd 计数 26 → 0；图标文件 31 → 0；`test:web` + `test:e2e` |
| P3 | P2 完成；所有页面双端走查通过 | 删 `antd` / `@ant-design/icons`；守卫终态；包体积对比 | `rg -n "antd\|@ant-design" apps/web/src apps/web/package.json` 0；`npm ls antd -w @moneybrain/web` 空；`npm run test` 全过；`npm run build` |

### 6.3 每批完成的固定动作

1. 该批页面全部改完再跑验收，不逐组件汇报。
2. 一次提交 = 一个页面 / 一个批次；提交说明写 antd 计数前后值。
3. 提交前跑 `typecheck:web` + `lint:web` + 该批相关单测。
4. 删除本批产生的死 CSS / 死组件；不留兼容 re-export。
5. 更新 `PROGRESS.md` 只在 P0/P1/P2/P3 节点，不逐文件登记。

### 6.4 验收命令基线

| 目的 | 命令 |
|---|---|
| 类型 | `npm run typecheck:web` |
| Lint | `npm run lint:web` |
| 单测 | `npm run test:web` |
| CSS 变量守卫 | `npm run test:web -- tests/unit/css-vars-guard.test.ts` |
| E2E | `npx playwright test --project=chromium-desktop --project=mobile` |
| AntD 计数 | `(rg -l "from 'antd'" apps/web/src \| Measure-Object).Count` |
| 图标计数 | `(rg -l "@ant-design/icons" apps/web/src \| Measure-Object).Count` |
| `--ant-*` | `rg -n "var\(--ant-" apps/web/src` |
| Mantine 变量外泄 | `rg -n "--mantine-" apps/web/src --glob '!styles/theme/**'` |
| 构建产物体积 | `npm run build -w @moneybrain/web`（记录 `dist/assets/*.js` gzip） |

### 6.5 工作量明细

| 期 / 批次 | 内容 | 人日 |
|---|---|---|
| P0 | 主题、Provider、图表取色、通知桥、守卫、测试环境 | 4–5 |
| 自建原语 | 12 项（§4） | 19–25 |
| P1 | 流水（11 文件，2216 行） | 4–5 |
| P1 | 报表 + 图表（12 文件，3045 行） | 5–6 |
| P1 | 预算（5 文件，1071 行） | 3–4 |
| P1 | 设置首屏（7 文件，890 行） | 3–4 |
| P1 | 首页（1 文件，401 行） | 1.5–2 |
| P2 | 投资（6 文件，1446 行） | 3.5–4 |
| P2 | 设置配置弹窗（11 文件，1277 行） | 4–5 |
| P2 | 公共组件（8 文件，1983 行） | 2–3 |
| P2 | 布局（2 文件，97 行） | 1–2 |
| P3 | 删 AntD / 守卫终态（1–1.5）+ 全量回归（4–5.5） | 5–7 |
| **合计** | P0 + 原语 + P1 + P2 + P3 | **55–72** |

> 自建原语与 P1 / P2 有复用关系：表单、上传、通知、弹层类原语在页面批次内直接使用，上表按「原语开发」与「页面迁移」两段分别计，不重复计页面里调用原语的时间。

---

## 7. 风险与回滚

### 7.1 风险表

| # | 风险 | 触发表现 | 处理 | 回滚粒度 |
|---|---|---|---|---|
| 1 | 双库全局样式互相污染 | AntD 页面 body 底色 / 字号被 Mantine 改掉；弹层 z-index 打架 | Mantine 样式先加载、项目 CSS 后加载；同页面不混用；P0 加探针页双主题截图 | 移除 Mantine 导入即回到 P0 前 |
| 2 | 暗色 body 不精确 | `--mantine-color-body` 不等于 `#0F1411` | 先靠 `dark[7]` 重排；P0 断言计算值；必要时用 `cssVariablesResolver.dark` 覆写并登记偏差 | 改色阶数组即可，不扩散到页面 |
| 3 | Mantine 表格能力缺口 | 分组表头 / 合计 / 折叠 / 列设置缺失 | 自建 `DataTable`，复用 `ReportDetailList` 现有树逻辑；不做虚拟滚动 / 固定列 | 单页可回退到旧 `ReportDetailList` |
| 4 | 时间控件两套并存 | PC 与移动行为不一致；预设 × 粒度矩阵错 | 统一 `TimeBar + TimePanel` 单渲染函数，纯日期逻辑留在 `utils/timePicker.ts`；W6 矩阵作为验收表 | 该页回退旧 `TimePickerField` |
| 5 | ECharts 主题不同步 | 暗色下轴线 / tooltip 仍是浅色；分类色与设计不符 | 图表只读 `ChartTokens`；`BaseChart` 按 scheme 重建 option；禁用业务组件取 AntD token | 单图回退旧 token 读取 |
| 6 | `as any` 圆角债扩散 | 主题文件之外出现 `as any` | 圆角键只在 `tokens.ts` 断言；守卫统计 `rg "as any" styles/theme` ≤ 2；其他位置出现即返工 | 单文件修改 |
| 7 | 测试环境缺 Mantine 依赖 | `matchMedia` / `ResizeObserver` 未定义；测试大面积报错 | P0 改 `tests/setup.ts`；测试渲染包 Provider；先跑 `test:web` 再迁页面 | P0 独立提交可回退 |
| 8 | React 19 升级被阻塞 | Mantine 9 无法安装；peer 冲突 | P3 后才评估；前置条件 = antd 已卸载、RTL 16 与 dnd-kit / echarts-for-react 兼容 | 不改 React 版本，单独分支 |
| 9 | 页面回滚失效 | P3 卸载 AntD 后无法单页回退 | P3 前保证每页独立提交；P3 作为单个提交，回滚 = 整体回退 | P3 前按页；P3 后整体 |
| 10 | 分类色与语义色重值 | 饼图红块被读成支出；图表分类不可辨 | P0 保留独立 `cat` token；UX5b 重调 6 色；P1 图表验收检查「分类色 ≠ 语义色」 | 只改 `tokens.ts` 色板数组 |

### 7.2 双库并存规则

| 规则 | 说明 |
|---|---|
| 同页面不混用 | 页面及其直接子组件只用一套；antd 页面不得引入 `ui/` 中依赖 Mantine 的组件 |
| 共享组件先迁 | `PageHeader`、`ErrorState`、`Transactions` 等被多页使用的组件，先迁并让调用页面跟着改 |
| 全局层允许共存 | `MantineProvider` / `Notifications` 与 AntD `ConfigProvider` 可同时在根节点；仅限全局层 |
| 图标可提前统一 | lucide 已在用；AntD 图标逐文件替换，不等待页面整体迁移 |
| 通知允许跨库 | Mantine toast 可以浮在 AntD 页面上（全局层），但该页不得调用 Mantine 组件做内容 |
| 不写兼容层 | 不为旧 AntD 页面保留 Mantine 适配分支；页面迁移时直接删除旧代码（决策 #39） |

### 7.3 暗色值记录方式

| 类别 | 要求 | 记录位置 |
|---|---|---|
| 页面底 / 面板 / 文字 / 边框 / 财务语义 | 必须等于 design-tokens 值 | `tokens.ts`；P0 浏览器断言 |
| Mantine 内部派生（hover / disabled / 选中浅底） | 允许近似，不得用于页面大面承载 | 本表追加行：`变量 / Mantine 来源 / 近似值 / 允许原因` |
| 封皮 / 反色浮层 | 必须精确；不随主题反转的项保持同值 | `tokens.ts` + 截图对比 |
| ECharts 分类色 | 必须用 `cat-1..6`，不得用语义色 | `ChartTokens.palette` |

### 7.4 按页面回滚可行性

| 阶段 | 是否可行 | 做法 |
|---|---|---|
| P0–P2 | 可行 | 每页一个提交；`git revert <page-commit>` 即可恢复该页 AntD 实现，Mantine 基础设施保留 |
| P3 之后 | 不可行（单页） | AntD 已卸载；回滚 = revert P3 提交 + 重新安装依赖，属整体回退 |
| 共享原语出问题 | 影响面大 | 原语单独提交、单独测试；页面提交不回滚原语，先修原语 |

---

## 8. 与既有条目的关系

| 既有条目 | 关系 | 执行口径 |
|---|---|---|
| **D4**（页面瘦身 / feature 切片 / 页面 < 200 行） | **前置**，不重复立项 | P0 不依赖 D4，可并行；P1 入口要求 D4 完成。`ui/` 原语层就是 D4 的落点，迁移只替换原语内部实现，不再新建第二套分层 |
| **U0**（`--ant-*` 命名空间隔离） | 已完成，成果延续 | `--ant-*` 基线已是 0；迁移期间守卫继续禁止回升；P3 后 AntD 变量随依赖消失 |
| **U1**（变量引用完整性） | 已完成，映射延续 | `--mb-*` 的引用即定义规则不变；P0 把定义源从 `config.ts` 换到 `tokens.ts`，键名按 design-tokens 收口 |
| **U1b**（CSS 变量守卫） | 扩展，不新增条目 | 守卫的 `buildCssVars()` 改从 `tokens.ts` 导入；保留「引用未定义 / 死变量」两条；新增「项目代码不得引用 `--mantine-*`」；P3 追加「`antd` / `@ant-design` import 必须为 0」。迁移期未消费的设计 token 进白名单并标注到期期次 |
| **U2–U3**（设备判定单入口） | 原则延续 | Mantine 断点只认 `md = 860px`；页面只用 `hiddenFrom="md"` / `visibleFrom="md"`；不恢复 `Grid.useBreakpoint()`，不新增 JS 断点 |
| **UX5a**（概念稿） | 设计输入 | 视觉与交互验收对照 `concept-design.md`；不在迁移中改设计结论 |
| **UX5b**（组件库驱动高保真） | 下游复用 | 选型结论即 Mantine 8；UX5b 的页面直接 import P0 的 `tokens.ts` 与 `ui/`，不手写第二套；其页面成为 P1 / P2 的对照实现 |
| **决策 #18**（AntD + 薄原语层） | 被本迁移取代 | P3 提交时按传播规则同步 `principles.md` 决策记录与 `dev-guide.md` checklist；本计划不改这两份文档 |
| **决策 #32**（`--ant-*` / `--mb-*` 隔离） | 继续有效，语义平移 | 项目代码只引用 `--mb-*`；`--mantine-*` 视为库内部命名空间，只在 `styles/theme/**` 出现 |
| **决策 #38 / #39**（最小实现 / 不留兼容层） | 执行原则 | 自建组件先做最小可用；页面迁移直接删除旧实现，不保留双路径 |
| **决策 #40**（UX5b 用组件库直接产页面） | 直接依据 | Mantine 8 是选定库；P0 主题骨架是 UX5b 的前置 |

**不新增重复条目**：迁移本身不登记为新的差距条目；归属 UX5b 的落地验收与 P3 的清理提交。只有在 P0 完成后，才在 `PROGRESS.md` 记一次进度节点。

---

## 9. 附录：基线测量（可复现）

| 指标 | 命令 | 结果 |
|---|---|---|
| antd 文件 | `(rg -l "from 'antd'" apps/web/src \| Measure-Object).Count` | 65 |
| 图标文件 | `(rg -l "@ant-design/icons" apps/web/src \| Measure-Object).Count` | 31 |
| 图标名 / 使用处 | 解析 31 个文件的 import | 39 名 / 85 处 |
| 组件符号 | 解析 65 个文件的 antd import | 41 个组件 + `theme` + 6 个类型名 |
| `--ant-*` | `rg -n "var\(--ant-" apps/web/src` | 0 |
| 迁移文件总行数 | 65 个 antd 文件 + Settings | 约 12.7k 行 |
| `theme.useToken` | `rg -l "theme.useToken" apps/web/src` | 34（另有 `config.ts` 只导入 `theme`） |

**工作量依据**：约 12.7k 行页面 / 组件代码按 300–350 行/人日（含测试与走查）约 36–42 人日；叠加 12 项自建原语 19–25 人日、P0 4–5 人日、P3 + 全量回归 5–7 人日；扣掉原语与页面工作的重叠（表单 / 上传 / 通知等原语在页面批次内复用），合计 55–72 人日。
