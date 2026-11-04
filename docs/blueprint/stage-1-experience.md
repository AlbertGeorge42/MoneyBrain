# 阶段 1 · 体验、界面与桌面化（M2）

> **目标**：让 MoneyBrain 在 PC 上成为一个**能独立用一整年**的产品——
> 不是"能跑的 Demo"，是装得上、记得快、找得到、信得过、愿意每天打开的东西。
>
> 这一阶段**不增加新的业务功能**。周期交易、标签、多账本、储蓄目标、票据、
> 按范围备份、待付款清单全部推迟（见 [stage-4](stage-4-expansion.md)）。
>
> **为什么先收拾界面、后加功能**：理由见[蓝图入口 §2](../rewrite-blueprint.md) 与决策 #29。
> 现有界面 66 个组件文件（58 个 `.tsx`）、15 个 CSS 文件共 1787 行、320 处内联样式
> （统计于 2026-10-28）——拖到移动端做完再统一，等于两端各改一遍。界面债的代价是
> 用户**不敢用**：一个数字对但点不动、加载闪空白、暗色看不清的账本，用户还是会弃用。

## 前置

阶段 0（M0–M1）完成：先把口径与结构收干净，再改界面（见 [stage-0](stage-0-foundation.md)）。
U0、U1、U1b 已完成，`--ant-*` 隔离、引用完整性与死变量守卫已由测试守住。

## 本阶段要解决的问题

| # | 问题 | 归属 |
|---|---|---|
| 1 | 冷启动没引导、记账步骤多、找不到旧交易、配置散落 | E1–E4（并入 U13.3 验收） |
| 2 | 数据一多桑基图就卡 | E6（并入 U13.4） |
| 3 | 变量命名空间冲突、断点三套并存 | U0–U3（已收口；U2–U3 降为原则） |
| 4 | 键盘不可达、焦点不可见、三态缺失 | U7（并入 U13.3）、UX5b |
| 5 | 没有设计规范文档，设计决策只存在于代码里 | U12（U13.5 后） |
| 6 | 文案散落在组件里，将来加第二种语言要重写全部组件 | L1–L3 |
| 7 | 要开终端 + 浏览器才能用 | K8 |

## 差距清单

### 批次 U · 界面重做（三段，按序执行）

**段一 · 地基（已收口）**：U0（`--ant-*` 隔离）、U1（引用即定义）、U1b（CSS 变量守卫）
已完成，明细见 2026-11-04 版 git 历史。U2–U3 降为原则，不再作为条目：
双端是**两套独立结构**，不是响应式断点；设备判定只有一个入口（已写入
[dev-guide §2.2](../dev-guide.md)）。迁移前的三套判定（自建 `useIsMobile` 860px、
AntD `Grid.useBreakpoint()` 768px、16 处媒体查询裸数字 480/680/860/1100）留作回溯，
明细见 2026-11-04 版 git 历史。

**段二 · 重设计（UX1–UX5b，不改代码）**：UX1–UX4、UX5a 已完成（产出物见下，明细见
[PROGRESS](PROGRESS.md)）。核心动作是记账（高频、连续、有状态），界面却按通用 CRUD 做；
两端应各自设计而非响应式缩放（决策 #36）。先设计、确认、后实现（决策 #35、#37）。
**本段不改应用代码**（唯一例外是 U13.1：只搭主题 / Provider，不改页面观感，是 UX5b 的前置）。

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| UX5b | 没有可对照的原型，UI 验收只能靠「看着还行」；手写高保真再翻译成组件库是两道工 | 按 **UX5a 确认稿**，用 **Mantine 8**（锁 `8.3.18`）产出**可运行的 React 高保真页面**（代表页 + 关键工作流），覆盖记账主流程、交易列表与搜索、报表四视图、账户总览、设置、空/错/加载三态。**前置**：U13.1 完成（决策 #40、#41），未接入不开工 | ① 可运行、可操作，每条验收清单项都能在页面上走查；② 与 `concept-design.md` 的 W1–W9 及双端结构一致；③ 视觉差异都能用 Mantine 主题机制解释，需 hack `--mantine-*` 之处记为「设计不可实现项」并回写概念稿；④ 不偏离 UX5a 确认稿做交互决策；⑤ 三态按 [interaction-spec §9](ux/interaction-spec.md) 验收 |

> **UX5 拆两段的原因**：见决策 #37——高保真里改布局的成本远高于改线框。两段之间设**确认关卡**：
> UX5a 未确认前不动原型界面；UX5b 发现问题回 UX5a 改，不在高保真里偷偷改。

**产出物**：`information-architecture.md`（UX1）、`interaction-spec.md`（UX2）、
`platform-design.md`（UX3）、`design-tokens.md`（UX4）、`concept-design.md`（UX5a 线框）、
`ux/prototype/`（UX5a 线框原型 + UX5b 高保真，均不进生产构建）。
`docs/design-system.md` 由 U12 在 U13.5 后产出，本阶段不建空壳。

**段三 · 落地（U4–U13）**：出口是「能干净地切到原型版本」，不是「旧页面视觉收口」。

- **取消（U5、U8–U11）**：验收对象是旧页面观感（死 CSS、三态表达、卡片/图标/过渡统一、
  暗色图表档位、移动导航 active）。切换后对象不存在，明细见 2026-11-04 版 git 历史。
- **并入 U13.3 / U13.4（U4、U6、U7）**：约束保留，但在迁移后的 Mantine 实现上验收，不返修旧组件
  （决策 #41）。U4 = 间距与字号单一来源（全树无内联 `fontSize`/`margin`/`padding`/`gap` 裸数字）；
  U6 = 触控目标 ≥44×44 + `env(safe-area-inset-*)`（真机验收与 H5 一起做）；
  U7 = 键盘可达、焦点可见、可访问名称 / 角色、装饰图标 `aria-hidden`、浮层关闭焦点回归。
- **E1–E4 并入 U13.3，E6 并入 U13.4**：能力随五屏新实现落地（以 UX5b 确认稿为准）——
  冷启动 3 步引导、常规记账 3 步、关键字搜索 + 批量改分类/删除、同类配置单一权威入口；
  桑基图取 Top N + 「其他」，大数据量不卡顿。

#### U13 · 组件库迁移（父条目，跨 UX5b 前后）

**总验收**：`apps/web/src` 中 `antd` / `@ant-design/icons` import 归零，`--ant-*` 引用归零；
业务代码不引用 `--mantine-*`（只允许出现在 `styles/theme/**`）；页面只用 Mantine + `ui/` 自建组件。

**基线（2026-11-04 实测）**：antd 文件 **65**（含 2 个 theme 文件）→ 0；图标文件 **31** → 0；
图标名 **39 个 / 85 处** → 0；组件符号 **41 个 + `theme` + 6 个类型名** → 0；`--ant-*` **0** 且不得回升；
迁移文件约 **12.7k 行**。计数按 **65 → 61 → 61 → 26 → 0**——U13.2 新增原语、不消灭 antd 文件，
故停在 61；执行日重测，按「该批拆掉 N 个文件」判，不硬套绝对值。

**工时（两个口径分开）**：A 纯迁移 **27–35**（结构/交互/布局不变，只换库；含 U13.1 的主题扩展预留
约 2 人日）；B 按 UX5b 重写增量 **29–39**（原语增强、页面布局/交互/IA、双端视觉验收）；合计 **56–74**。
回答「换个库为什么这么久」只报 A；B 记在 UX5b 的落地成本里。分项上下界不做严格相加。
预留在 P0 一次做完，后补需 **6–10 人日**且必然返工；UX5b 侧「token 表按 themeId 分组」计入 B，不重复计。

**顺序**：`D4 → U13.1 → UX5b → U13.2a → U13.2b → U13.2c → U13.3a → U13.3b → U13.3c → U13.4 → U13.5 → U12`；
D4 与 U13.1 可对调。硬边：U13.1→UX5b、UX5b→U13.2、U13.2→U13.3、D4→U13.3、U13.5→U12。

| 子条目 | 现状 → 目标 | 验收（含计数） | 依赖 | 工时 A / B |
|---|---|---|---|---|
| U13.1 主题骨架 | AntD 算法派生颜色、`data-theme` 手写、`message`/`notification` 直调 → `tokens.ts` + `ThemeRoot` + `useMantineColorScheme` + Mantine notifications；删 `config.ts` / `chart-tokens.ts` / `financial-tokens.ts` / `mode.ts` | antd **65 → 61**（拆 2 theme + `main.tsx` + `useNotify.ts`）；`--ant-*` 0；`--mantine-*` 外泄 0；`typecheck:web` / `lint:web` / `test:web` 全过；theme.spec 浅/暗 body 断言；已注册主题覆盖 40 × 2 scheme；build 记录 gzip | UX5a 确认 + U1b；**不依赖 D4 / UX5b** | 5–7（A，含扩展预留约 2 人日）/ 0 |
| U13.2a 数据与选择原语 | `ui/` 为空 → `DataTable`（分组表头 / 合计行 / 行折叠 / 列显隐）、`TreeSelect`、`TimeBar + TimePanel`（W6 九维度）、`Sheet` | 本组 **4/4** 有测试；`rg "from 'antd'" apps/web/src/ui` 0；每项有消费者或登记待接入；antd **61 → 61** | U13.1 + UX5b 确认 | 6–7 / 3–4 |
| U13.2b 状态与反馈原语 | → `EmptyState / LoadingBlock / ResultState`、`UploadBox`、`Metric / KpiCard`、`UndoToast + useNotify` | 本组 **4/4** 有测试；antd **61 → 61** | U13.2a | 3–4 / 2–3 |
| U13.2c 表单与展示原语 | → `TypeBadge / CountBadge`、`FormField / CurrencyInput`、`ResponsiveOverlay / ConfirmDialog`、`Icon`（39 → lucide） | 本组 **4/4** 有测试；**12/12 有测试**；antd **61 → 61**；映射表见 [mantine-mapping](ux/mantine-mapping.md) | U13.2b | 4–5 / 2–3 |
| U13.3a 流水页 | 流水 11 个 antd 文件 / 2216 行 → Mantine + `ui/`；旧时间控件 / 报表树删除；撤销移出查询层 | 本组拆 11；`--ant-*` 0；页面 <200 行；对照 W2/W3/W4；`test:web` + 双 project；错误边界按不变量 12 验收 | U13.1 + U13.2c + **D4** + 该页 UX5b 已确认 | 3–4 / 4–5 |
| U13.3b 报表页 | 报表 12 个 antd 文件 / 3045 行 → Mantine + `ui/` | 本组拆 12；`--ant-*` 0；页面 <200 行；对照 W6；`test:web` + 双 project；错误边界按不变量 12 验收 | U13.3a | 2–3 / 3–4 |
| U13.3c 预算 / 设置首屏 / 首页 | 预算 5 / 1071 行、设置首屏 7（6 antd）/ 890 行、首页 1 / 401 行 → Mantine + `ui/` | 本组拆 12（预算 5 + 设置 6 + 首页 1）；`--ant-*` 0；页面 <200 行；对照 W5/W7/W8；`test:web` + 双 project；错误边界按不变量 12 验收 | U13.3b | 2–3 / 2–3 |
| U13.4 P2 其余 | 投资 6、配置弹窗 11、公共组件 8、布局 2；图标 31 文件 → lucide；删 `TimePickerField`/`TimePickerMobile`/`TRANSACTION_TAG_PRESETS`；E6 Top N 并入 | antd **26 → 0**；图标文件 **31 → 0**；`rg "@ant-design/icons"` 0；图标映射见 [mantine-mapping](ux/mantine-mapping.md)；`test:web` + `test:e2e`；错误边界按不变量 12 验收 | U13.3c | 10–14（A 25% / B 75%） |
| U13.5 P3 收口 | 双库并存、依赖仍在 → 卸载 `antd` / `@ant-design/icons`；守卫终态；文档切换 Mantine 单源 | `rg -n "antd\|@ant-design" apps/web/src apps/web/package.json` 0；`npm ls antd` 空；`npm test` 全过；build 对比 gzip | U13.4 + 双端走查 | 5–7（A 40% / B 60%） |

> U13.2 / U13.3 拆成三份只为「1–2 次会话可完成」；分项上下界不做严格相加，
> 总量以父条目 **19–25** / **17–21** 为准。

**U13.1 验收命令**（typecheck / lint / test 用 [dev-guide](../dev-guide.md) §9.1 基线）：
`(rg -l "from 'antd'" apps/web/src | Measure-Object).Count` = **61**；
`rg -n "var\(--ant-" apps/web/src` = 0；`rg -n "--mantine-" apps/web/src --glob '!styles/theme/**'` = 0；
`npx playwright test e2e/tests/theme.spec.ts --project=chromium-desktop`（浅色 `rgb(245,242,234)`、
暗色 `rgb(15,20,17)`）；`npm run build -w @moneybrain/web` 成功并记录 gzip。

**U13.1 验收补充**：每个已注册主题必须完整覆盖 **40 个 token 名 × 2 scheme**，缺一即失败（扩
`css-vars-guard` 一条用例）；`styles/theme/**` 之外不得出现色值 / 密度 / 圆角 / 字号字面量（grep 进验收命令）；
**初版只注册一个主题**，但结构必须按 registry 写——不得因「只有一个」就退回单例或硬编码。

**U13.1 接入清单**

- 依赖：`@mantine/core` / `hooks` / `form` / `dates` / `notifications` / `dropzone` 全部锁 `8.3.18`；
  `postcss-preset-mantine` + `postcss-simple-vars`（断点 `xs`–`xl`）。样式顺序：Mantine 四份 CSS →
  `variables.css` → `reset.css` → `global.css`；AntD 继续走 CSS-in-JS，U13.5 才卸载。
- 主题：新增 `styles/theme/tokens.ts`（`buildMantineTheme(spec, scheme)` /
  `buildCssVars(spec, scheme)` / `getChartTokens(scheme)`）与 `ThemeRoot.tsx`（`MantineProvider` → `DatesProvider` → `Notifications`）；
  `ThemeContext` 保留公开 API，内部委托 `useMantineColorScheme` + `useComputedColorScheme`。
  删除 `config.ts`、`chart-tokens.ts`、`financial-tokens.ts`、`mode.ts`；`reset.css` 选择器改
  `[data-mantine-color-scheme='dark']`；`variables.css` 只放结构 token。
- 颜色：Mantine `colors` 10 级色阶（gray / dark / brand，body 固定 `dark[7]`）；语义/封皮/反色
  **不进 `colors`**，放 `theme.other` + `--mb-*`。色值唯一来源是 [design-tokens](ux/design-tokens.md)，
  此处只列「角色 → `theme.other` 键」映射，不抄值。分类色保留独立 `cat-1..6`：按色相环与语义色
  错开（与 income/expense/transfer 最小 30°、cat 内相邻 ≥25°、暗色另备一套），验收口径为
  「文字 ≥4.5:1、色块 ≥3:1、相邻分类可辨」，不采用语义色派生档。
- 图表：`useChartTokens` 改从 `theme.other` 取色；`BaseChart` 按 scheme 注册 `mb-light` / `mb-dark`；
  分类色只读 `cat-1..6`，超过 6 类聚合为「其他」。
- 命名过渡：`buildCssVars()` 同时产出目标 `--mb-*` 与旧名 `--mb-color-*` 别名（27 文件 / 203 处），
  U13.5 清零；别名只存在于生成器，不写进设计文档。
- 测试：`tests/setup.ts` 补 `matchMedia` / `ResizeObserver` mock；RTL 外包 `ThemeRoot`。

**主题可扩展性（预留；初版只做一种皮肤）**

- `ThemeSpec` = 颜色（40 个 token 名 × 亮/暗各一）+ 结构（密度 / 圆角 / 阴影 / 字体四条）+ 字体三元组
  （ui / display / num，标是否需打包资源）；`theme/specs/{themeId}.ts` 各自导出同一个 `ThemeSpec`。
- `tokens.ts` 只做注册表 + 聚合 + 工厂，**不做模块级单例**；`buildMantineTheme(spec, scheme)` 与
  `buildCssVars(spec, scheme)` 都是纯函数。
- 持久化 `themeId` / `mode`；ECharts 主题名 `mb-{themeId}-{scheme}`，按需生成，不预烘焙。
- 新增皮肤 = 加一个 spec 文件并注册；页面与组件只读 `--mb-*` / `theme.other`，不读 `themeId` 做条件渲染。
- 初版只注册一个主题，但**不得**因「只有一个」退回单例或硬编码；否则第二种皮肤落地时是重写而不是扩展。

**U13.2 的 12 项**：`DataTable`（分组表头 / 合计行 / 行折叠 / 列显隐）、`TreeSelect`、
`TimeBar + TimePanel`（W6 九维度）、`Sheet`、`EmptyState / LoadingBlock / ResultState`、`UploadBox`、
`Metric / KpiCard`、`TypeBadge / CountBadge`、`FormField / CurrencyInput`、
`ResponsiveOverlay / ConfirmDialog`、`Icon`（39 → lucide）、`UndoToast + useNotify`。
全部放 `ui/`，按 D4 的 feature 切片公开入口引用，不放桶导出。按 a/b/c 各 4 项推进。
明确不做：虚拟滚动、固定列、列拖拽、Sheet 多段停靠、完整 i18n 框架（触发条件见决策 #38）。

**图标约定**：尺寸 16 / 导航 20 / 主卡 22 / 空态 32；`strokeWidth=1.75`；`currentColor`；
装饰图标 `aria-hidden`，纯图标按钮必须 `aria-label`；从 `lucide-react` 具名导入，不建全量映射对象。

**五屏范围**：流水 11 文件 / 2216 行；报表 12 / 3045；预算 5 / 1071；设置首屏 7（6 antd）/ 890；
首页 1 / 401。**U13.4 其余范围**：投资 6 / 1446；设置配置弹窗 11 / 1277；公共组件 8 / 1983；布局 2 / 97。

**双库并存（迁移期）**：规则见 [dev-guide §2.3](../dev-guide.md)（同页面不混用、整页换、不写兼容层、
Provider / Notifications 可共存、图标可提前换）；本阶段补充一条顺序——**共享组件先迁，调用页跟着改**。

**风险与回滚（6 条）**：双库全局样式污染（同页面不混用 + 探针截图）｜DataTable 能力缺口（自建，
复用报表树逻辑）｜时间控件两套并存（单渲染函数 + W6 矩阵验收）｜ECharts 主题不同步（只读
`ChartTokens`）｜测试缺 Mantine 依赖（U13.1 改 setup）｜分类色与语义色重值（独立 `cat-1..6`，
验收见上）。暗色精度与 `as any` 见决策 #41，不重复。回滚：U13.5 前按页 `git revert`；
U13.5 后 AntD 已卸载，只能整体回退。

**验收命令（特有项）**：antd 计数、图标计数、`rg -n "var\(--ant-"`、`rg -n "--mantine-"`
（`--glob '!styles/theme/**'`）、`npm run build -w @moneybrain/web`（记录 gzip）。
映射表（组件符号 / 类型名、图标、色阶）见 [mantine-mapping.md](ux/mantine-mapping.md)，仅 U13 执行时查阅。

**切换时 token 重规范（口径，不是执行清单）**

- **保留机制**：单一定义源（结构 token 只在 `variables.css`、颜色只从一个导出出口注入）、
  `--mb-` 前缀与库变量隔离、U1b 的引用完整性 / 死变量守卫、token 之外无字面量（半透明走 `color-mix`）、
  对比度 ≥4.5:1 可脚本断言。
- **重写**：值、语义层与档位命名按 [design-tokens](ux/design-tokens.md) 在 UX5b 定稿；
  现有 58 个 token 的删改属执行清单，不写进蓝图。
- **两层映射（决策 #41）**：颜色走 Mantine `createTheme.colors`（10 级色阶，body 底色固定取
  `dark[7]`），结构走 `--mb-*` CSS 变量——**不得出现第三个颜色来源**。`#0F1411` 不等于 `dark[7]`
  默认值；若必须精确需重排整条色阶，记为已知代价、不作为 bug。
- **机制要改一处**：颜色定义源从「AntD 算法派生」改为「`createTheme` 里显式声明的色阶」——
  新色值（暖纸面 `#F5F2EA`、墨绿夜账本 `#0F1411`）不是库算法能派生的。
- **三处缺口须在 UX5b 前补齐或明确复用**：① 交易类型色缺 `refund` / `adjustment`；
  ② 现金流语义缺 `cash` / `non-cash` / `investing`；③ 交互状态色缺 `hover` / `selected` / `disabled`。

**与其它批次的关系**

- U 批次**不替代** E：E 是「功能缺失」，U 是「界面不对」；E1–E4 的能力随 U13.3 一并落地验收，
  E6 随 U13.4；不再作为「改造旧界面」的条目。
- U 批次**不产生**新数据模型，不影响同步契约；UX 段同样不产生新实体、不改口径。
- U6 的**真机验收**（44px 触控、安全区）与阶段 3 的 H5 一起做；U11 已取消——原型已定，新实现自带。
- **阶段 3 的 H 批次依赖 UX3**：手机界面若另起一套设计，H 批次会变成一边写一边设计。
- **K8 与界面无关**：K8 是「装得上」的壳，不改界面，可在本阶段任意时点做；其前置 V1 在 U13.1 后立即做。

**批次出口**：U 批次**完成 = 前端能干净地切到原型版本**：

1. **命名空间隔离**（U0，已完成）：AntD `--ant-*` 与项目 `--mb-*` 零重叠；
2. **引用完整性守卫**（U1、U1b）：引用即定义、无死变量，改完不复发；
3. **设备判定单入口**（原则）：JS 与 CSS 同源，双端独立结构下只有一个判定入口；
4. **token 骨架能接住新值**：单一定义源、前缀隔离、无字面量规则、对比度断言可直接装载 UX5b 的新值。

**不在出口内**：旧页面的视觉收口（已取消）与 token 的具体值 / 语义层（挂 UX5b）。

### 批次 L · i18n 基础设施（文案目录与本地化边界）

**为什么 i18n 在这里做**：抽取成本随代码量线性上升，阶段 1 正好逐个改组件；
理由与「不上重型框架」的边界见 [rewrite §2](../rewrite-blueprint.md) 与决策 #30。
这里只做**轻量查表 + 边界固化**，让「上第二种语言 = 补一份目录 + 换 locale」成立。

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| L1 | 用户可见文案散落在组件里，无统一目录 | 建单一文案目录 `packages/contracts/src/i18n/`，初始只含 `zh-CN`；配一个轻量查表函数；**所有新增或被修改的用户可见文案必须先进目录**；配一条 lint（如 `no-restricted-syntax`）拦住新增的用户可见裸字符串；key 形状 `feature.page.element[.state]`；查表只支持 `{}` 插值；lint 同时扫 `.tsx` 的 JSX 文本与字符串字面量 | 目录存在且可查；**新增 / 被修改的文案零裸字符串**（存量清零留到阶段 4 · J1，见 L3）；查表函数有测试；lint 对新文件生效；key 命名符合上述形状 |
| L2 | 本地化边界没有钉死 | 展示格式化四个入口：`formatMoney(minor, locale, currency)`、`LocalDate`、`formatTime`、`formatPercent`，一律走 `Intl` 封装，页面不得自拼货币符号或日期格式；错误提示走错误码映射（后端不拼用户文案）；**CSV / 备份 / 同步格式的键名与枚举值不本地化**（它们是机器格式）；分类名、账户名、备注属于用户数据，**不翻译**；文案保持完整句子，不拼「前缀 + 名词 + 后缀」 | 页面层（`features/**`、`pages/**`）无 `toFixed`、无 `¥` 字面量、无 `dayjs().format`（grep 进验收）；错误文案无后端拼接；机器格式键名未被本地化 |
| L3 | 既有散落文案数量大，一次性抽取是永远排不上队的工程 | 已有的散落文案**在被触及时**（改到那个文件、那行时）顺手迁进目录，**不做一次性全量抽取**；本阶段触及的文件内不再有裸字符串 | 本阶段改动过的文件零裸字符串；目录覆盖率随改动递增而非停滞 |

> **触发条件仍在阶段 4**：真的要上第二种语言时，一次性接入语言切换 UI 与 `en-US` 目录。
> 那次工作量应当只有「补翻译 + 接 locale + 清理 L3 尚未触及的存量文案」。

### 批次 K8 · 桌面壳（装得上、启动得了）

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| K8 | 要开终端 + 浏览器才能用 | 桌面一键启动（Tauri 优先）：双击即用，数据目录可迁移。**前置**：V1 spike 通过（U13.1 后立即做） | 双击启动、可选开机自启；卸载不删数据；数据目录可整体搬走 |

**为什么只留 K8**：K8 不改数据模型，是纯粹的「壳」——装不上、启动不了的应用不算产品。
其余 K 条目（K1–K7）推迟，见 [stage-4](stage-4-expansion.md) 批次 K。

### 批次 U12 · 设计规范（U13.5 后）

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| U12 | 无设计规范文档，token 变量无说明；设计决策只存在于代码里 | 建立 `docs/design-system.md`：token 清单与选用规则、间距/字号阶梯、组件规范、可访问性要求（写明可访问名称 / 角色、装饰图标 `aria-hidden`、浮层关闭焦点回归；只写要求不写实现） | 新增组件照文档能做出与现有组件一致的界面 |

## 验收基线（「PC 端可用」清单）

本阶段的出口条件 = 阶段 0 + 阶段 1 累计。用户能独立用 MoneyBrain PC 版完成一整年的记账，
且中途不需要开发者介入：

| # | 能力 | 验收 | 来源 |
|---|---|---|---|
| 1 | 冷启动可用 | 新库有引导，3 步内看到非零净资产 | E1 |
| 2 | 日常记账够快 | 常规记账 3 步内完成 | E2 |
| 3 | 查得动 | 关键字搜索 + 批量操作 | E3 |
| 4 | 不怕误删 | 单条删除可撤销；批量/覆盖/清空有明确确认与数量 | B2、E3 |
| 5 | 数据可找回 | 覆盖导入有回滚点；备份能恢复（`db:drill` 通过） | B1、B3 |
| 6 | 报表可信 | 四张报表数字自洽，对账条差额为 0 | C1–C3 |
| 7 | 配置有入口 | 同类配置只有一个权威入口 | E4 |
| 8 | 大数据不卡 | 桑基图取 Top N | E6 |
| 9 | 界面可信 | 引用即定义、无死变量；设备判定单入口 | U1、U1b、原则 |
| 10 | 键盘可用 | 纯键盘走通主流程，焦点始终可见（新实现验收） | U7 |
| 11 | 三态一致 | 加载/空/错三态齐全且一致（原型已定，新实现自带） | UX5b |
| 12 | 视觉一致 | 按高保真稿实现；暗色对比度达标 | UX5b |
| 13 | 规范可查 | `design-system.md` 存在且能指导新组件 | U12（U13.5 后） |
| 14 | 文案可查表 | 新增/修改文案零裸字符串（存量清零在 J1）；金额、日期、时间、百分比只有一个格式化入口 | L1–L3 |
| 15 | 装得起来 | 桌面可一键启动（Tauri），不要求用户开终端 | K8 |
| 16 | 数据能带走 | 导出格式长期稳定，能用标准工具读出全量账目 | 阶段 2 |

第 1–15 条是**「PC 端可用」的门槛**：装不上、启动不了、找不到数据的应用不算产品。
即使移动端与自动同步永远不做，MoneyBrain 依然是一个完整的个人财务工具。

## 本阶段不做

新业务功能（周期交易、标签、多账本、储蓄目标、票据、按范围备份、待付款清单）——
推迟到 [stage-4](stage-4-expansion.md)。同步协议、移动端、自动记账见入口的阶段总览。
