# MoneyBrain 开发规范

> 本文回答**新代码必须怎么写**。这是**当前可执行的唯一规范**。
> 代码现状见 [architecture.md](architecture.md)，账务口径见 [requirements.md](requirements.md)，界面规范见 [ui-design.md](ui-design.md)，计划见 [roadmap.md](roadmap.md)。
> 与计划冲突时以本文为准。

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、Vite 5、TypeScript、Mantine 8（锁 `8.3.18`；AntD 已完全移除）、自绘 SVG 图表、TanStack Query、Axios |
| 后端 | Express 4、TypeScript、Prisma 5、SQLite、pino / pino-http |
| 桌面 | Electron 45 + electron-builder（`apps/desktop/`，NSIS / portable） |
| 领域内核 | 纯 TypeScript（`packages/domain`，无框架、无数据库依赖） |
| 契约 / 同步 | `packages/contracts`（类型 + 错误码 + 常量）、`packages/sync`（记录级合并 + 加密容器） |
| 测试 | Node Test Runner（领域/同步）、Vitest、React Testing Library、Supertest、Playwright |

## 2. 目录

```
apps/api/src/
├── routes/               # 参数校验 + 委托 service
├── services/             # 业务编排；金额计算一律委托领域层
│   ├── ledger.adapter.ts # Prisma BigInt 分 ↔ 领域类型
│   ├── report/           # 四张报表
│   ├── import/ export/   # 备份与 CSV
│   └── investment/       # 资产类型、快照、收益
├── common/               # 错误、HTTP 信封、请求 ID、日期、校验器、日志
├── db/repositories/      # 各模型 Prisma 访问的唯一入口
└── prisma.ts

apps/web/src/
├── App.tsx               # 唯一入口：始终渲染 DesignApp
├── app/design/DesignApp  # 页面装配、路由、全局状态、浮层宿主
├── features/<domain>/    # budgets · overview · reports · settings · shell · shared · transactions
├── features/shared/      # 跨域组件（HfButton/HfSheet/HfSegmented/HfSwitch/HfTabs/Card/StateViews/toast）
├── components/common/    # ErrorBoundary
├── services/             # api.ts（Axios）、apiError.ts、apiResult.ts
├── styles/               # global.css · reset.css · theme/{hf-theme.ts,variables.css}
├── utils/ · dev-fixtures/ · main.tsx
（无 ui/、queries/、hooks/、layouts/、pages/ 目录；不要再新建同类目录）

packages/domain/src/      # money · date · investment · ledger/ · budget/ · statements/ · projection/；D 批模块边界见 §3.5
packages/contracts/       # types/index.ts · constants.ts · utils/tree.ts · i18n/
packages/sync/src/        # records · merge/apply · container（与端无关，不依赖文件系统/网盘 SDK）
apps/desktop/             # src/main.cjs · electron-builder.yml · scripts/{stage-app,after-pack}
```

### 2.1 CSS 变量

两套命名空间严格隔离，互不引用：

| 命名空间 | 定义处 | 使用规则 |
|---|---|---|
| `--mb-*`（项目） | 结构（间距/字体/边框/圆角/动效/布局/z-index）只在 `styles/theme/variables.css`；颜色/阴影只由 `hf-theme.ts` 的 `cssVariablesResolver` 输出 | 项目 CSS/TSX 的唯一变量来源；不得出现第二定义源 |
| `--ant-*`（AntD） | 已随 AntD 一起移除 | 业务代码不得再出现 `--ant-*`；`--mantine-*` 属库内部变量，不得覆盖 |

CSS 引用未定义变量**不报错**、浏览器静默回退：写 `var(--mb-*)` 必须「引用即定义」，有 lint 守卫。详见 [ui-design.md](ui-design.md) §2.1。

### 2.2 设备判定只有一个入口

双端是**两套独立结构**，不是响应式断点。设备/断点判定只从一个常量 + 一个 hook 产出，CSS 与 JS 都从这里对齐；不得同时存在 `Grid.useBreakpoint()` 与自建 hook。CSS 媒体查询阈值不得各写各的裸数字（CSS 自定义属性在 `@media` 条件中不生效，需构建期解析或由单一选择器切换）。阈值与行为见 [ui-design.md](ui-design.md) §2.4。

### 2.3 组件库规则（Mantine 8）

**唯一组件库是 Mantine 8（锁 `8.3.18`）**——9.x 的 peer 要求 React 19，项目当前 React 18，升级需另行决策。

- **不得引入 AntD**：`antd` / `@ant-design/icons` import 恒为 0；同页面不混用组件库。
- **主题只从 `createTheme` 出**：颜色走 `colors` 10 级色阶（body 底色取 `dark[7]`），结构走 `--mb-*`；**不得出现第三个颜色来源**。
- **自建组件必须进白名单**并有测试覆盖；白名单以 `features/shared` 的实际消费者为准，规范见 [ui-design.md](ui-design.md)。能用库组件拼出来的不许自建。
- **新增主题 = 新增 `ThemeSpec` 文件并注册**：组件只读 `--mb-*` 与 `theme.other`，不得读 `themeId` 做条件渲染。
- **字体单一来源**：全站只用 `--mb-font-ui` 一条栈，标题 / 数字同栈，靠 `body` 的 `tabular-nums` 对齐；字号只取 `--mb-fs-0…6`（最小 12px），字重只取 400 / 500 / 600。不写 `font-family` 字面量或 10/11px 字号。
- **已知技术债**：自定义圆角键需 `as any`（类型只认 xs..xl）——二选一处理（提交 `DefaultMantineColor` / `DefaultMantineRadius` 模块增强，或接受并记录），不得用 `@ts-ignore` 掩盖。

#### darkfirst 主题落地约定（实现约定只写在这一处）

1. **静态 CSS 是唯一生产路径**：结构 token 由 `variables.css` 提供；颜色/阴影由 `hf-theme.ts` 的 `cssVariablesResolver` 输出 `--mb-*`，随 Mantine colorScheme 在 `:root` 切换；`index.html` 首帧内联脚本先写 `data-mantine-color-scheme` 防闪烁。业务 CSS/TSX 手写色值即返工。
2. **主题唯一来源是 Mantine**：`defaultColorScheme='auto'`，三档 light / dark / auto，存储键 `moneybrain-theme-mode`。不自建 Context、`data-theme` 或并行 token 表。
3. **accent 双档**：`accent` 只用于文字 / 图标 / 链接 / focus 环；`accent-fill` 只用于填充面。亮色下所有 `accent-fill` 面统一 1px solid `#356B0C`，暗色 `transparent`——阴影不能替代描边。填充上文字一律 `on-accent-fill` `#0D1005`，禁止 Mantine 默认白字。
4. **支出色是硬要求**：`expense` / `expense-display` 必须与 `+` / `−` 符号、右对齐金额列同时出现；支出禁用橙色或正红；≥24px 或 ≥18.66px 粗才允许切 `expense-display`。
5. **danger 只给破坏性动作**：删除 / 清空 / 覆盖 / 退出未保存，且必须「图标 + 动词文案 + 二次确认」（写「删除 12 笔」不写「确定」）。普通错误用 `text-primary` + ⚠。
6. **Electron 窗口底色**：`apps/desktop/src/main.cjs` 的 `BrowserWindow` 用 `backgroundColor: '#F6F6F4'` 作首帧兜底（CSS 管不到原生窗口）；主题切换由 Mantine 在页面内处理，不往主进程写第二份主题状态。
7. **投资页正负色 = 全局「正绿负红」**：盈利 `income`、亏损 `expense`，图例写「收入/支出」「盈利/亏损」，禁用「涨/跌」。
8. **图表只走 1:1 viewBox**：宽度按容器实测写入，高度只由 `features/shared/chartLayout.ts` 的 `CHART_HEIGHT` 提供；禁 `preserveAspectRatio="none"`，`padL` 按最长刻度文字宽度推算，报表页复用 `buildChartLayout`。

## 3. 领域层规则（最高优先级）

### 3.1 算钱只能有一个实现

```ts
import { postingsOf, summarizeFlows, remainingRefundable } from '../../../../packages/domain/src/index.js'
```

| 口径 | 落在哪里 |
|---|---|
| 交易 → 分录的方向与金额 | `ledger/rules.vN.ts` 的 `postingsOf`（按交易版本取） |
| 余额（含期初当天计入） | `ledger/postings.ts` 的 `balanceBefore` / `balanceAt` |
| 收支净额与分类汇总 | `ledger/summary.ts` 的 `summarizeFlows` / `flowByCategory` |
| 退款可退余额 / 冲减方向 | `remainingRefundable`；`refundOffsetKind`（收入退款 = 流出、支出退款 = 流入，`relatedType` 不明返回 null 不计入） |
| 预算账户/分类/冲减口径 | `scopeQuery` / `matchesBudgetScope` + `budget.service` 的 `budgetContributionSign`（唯一计入符号判定点）；使用率返回真实百分比，>100 不截断 |
| 日期格式化 | `packages/domain/src/date.ts` 的 `fromDate` |
| 前后端共用字面量 | `packages/contracts/constants.ts` |

- **统计类接口**：用 `groupBy` 在 SQL 里按「类型 × 退款原类型 × 不计收支 × 口径版本」聚合，再把聚合行交给 `summarizeAggregatedFlows` 按各自版本解释。不要读整表明细进内存——扫描量必须随期间增长，不随总历史增长。
- **`ledger/rules.ts` 是口径唯一来源**：同时被领域层纯函数与后端 SQL 条件消费，所以「统计哪些类型」「退款冲减哪一侧」不会各写一份；实际规则按版本冻结在 `rules.vN.ts`。
- **口径带版本**：交易写入时记录 `ruleVersion`，解释历史数字按交易自己的版本取规则。新增版本 = 复制 `rules.v1.ts` 为 `rules.v2.ts` 改行为 + `registerRuleSet(V2_RULES)` 登记；**已登记版本不允许覆盖**，未知版本直接失败不回退；新交易写入用 `CURRENT_RULE_VERSION`。
- **转账现金流两侧都必须经领域层规则取值**：转出 `transferOutflow(amount, fee, coupon)`、转入 `transferInflow(amount)`；报表不得直接把 `transfer.amount` 当现金流解释。

**禁止**在组件、route、service 中写 `if (type === 'refund') amount = +amount` 之类的金额分支，也禁止在领域层与 service 各留一份口径定义。

### 3.2 金额与日期

- 金额全链路整数分：DB `BigInt`、契约/API/前端 `Minor`（branded number）；**元只出现在用户输入框与文件（CSV / 备份）两个边界**。
- 输入按字符串解析（`parseAmount('8.11')` → `811`），最多 2 位小数超出报错；禁止 `Number(x) * 100`、`parseFloat`、`toFixed`、`Decimal`、前端浮点加减。
- 字段名不加单位后缀；人类读的地方必须写单位（CSV 表头「金额（元）」、UI 标签、错误信息）。服务端是信任边界：外部金额先校验「安全整数 + 范围」，不合法 400，不静默取整。
- 支出金额写入统一为正（`transaction.service.ts` 的 `normalizeExpenseAmount`）；历史负数用 `npm run db:fix-expense-sign` 修复（默认 dry-run，`--apply` 先导出 `.mbx` 备份再逐条推进 `rev`/`vv`），**不要手改库**。
- 展示格式化只有四个入口：`formatMoney` / `LocalDate` / `formatTime` / `formatPercent`，一律走 `Intl` 封装；页面不得自拼货币符号或日期格式（禁 `toFixed`、`¥` 字面量、`dayjs().format`）。
- 领域层只认 `LocalDate`（`YYYY-MM-DD`），期间一律半开 `start <= date < endExclusive`；禁止 `new Date('YYYY-MM-DD')`、`23:59:59.999`、`slice(0, 10)` 截断。
- **API 日期契约**：账本日期字段（`date` / `startDate` / `endDate` / `initialBalanceDate`）由 `common/http.ts` 统一输出 `YYYY-MM-DD`；`createdAt` / `updatedAt` / `deletedAt` 仍是 ISO 瞬时。
- 五类交易的 `amount` 含义、期初余额语义、退款与净资产恒等式等**账务口径以 [requirements.md](requirements.md) §3 为唯一来源**，本文不复述。

### 3.3 同步合并

- **合并只有一个实现**：`packages/sync` 的 `mergeRecord` / `mergeRecords`。service / repository / 前端不得另写「谁更新」的比较逻辑；比较先后一律用版本向量（`compareVersionVectors`），禁止用时间戳。
- **并发冲突两版都留存**：生效版本由稳定全序选出，输的一版写进本地 `sync_conflicts`（`recordConflict`），不能只在内存；冲突表不进容器、不参与同步。
- **解决冲突只写一条新记录**：`rev` / `vv` 用 `resolutionStamp(left, right, deviceId)` 生成，同时支配两个旧版本。
- **合并核心不认识实体类型**：引用完整性通过 `SYNC_REFERENCES` 注册表声明；悬空/墓碑引用进「待补全」，不入账、不参与余额与报表。
- **合并是纯函数、顺序无关**：同一批记录任意顺序应用两次逐字段一致；改判定逻辑先跑 `packages/sync/test-vectors/merge-vectors.json` 与 `npm run test:sync`。

### 3.4 加密容器

- **容器只有一份实现**：`packages/sync/src/container.ts`；备份与同步共用同一 `sealContainer` / `openContainer`，禁止在 service / 脚本 / 前端另写加解密。字节格式见 [sync-container-format.md](sync-container-format.md)。
- **加密库已锁定**：Argon2id 用 `@noble/hashes`，AEAD 用 Node 内置 `crypto` 的 `chacha20-poly1305` + 自实现 HChaCha20。移动端换实现必须保持同一字节格式（`formatVersion = 1`）。
- **拒绝规则分两层**：未知 `formatVersion` / 头部非法 → 整批拒绝；未知 `entityType` → 只跳过该条并警告，已识别实体照常合并。
- **本地字段不进容器**：`investmentSnapshot.previousSnapshotId` 在 `sealContainer` 里统一剔除，应用后按 `packages/domain` 的 `sortSnapshotChain` / `resolvePreviousSnapshotIds` 重算；新增本地字段只改 `LOCAL_ONLY_DATA_FIELDS` 一行。
- `formatVersion = 1` 在跨端与真机初始化开销验证前不算冻结；改字节布局前先看 [roadmap.md](roadmap.md) §4。

### 3.5 领域算法下沉（D 批）的操作规则

结构约束见 [architecture.md](architecture.md) §2.7，阶段与验收见 [roadmap.md](roadmap.md) §3 的 D 批。写代码时逐条遵守：

- **输入 / 输出类型由 Domain 自己定义**：不得 import `packages/contracts`、`@prisma/client`、Express、SQLite 或 `apps/**`；Prisma Model / `GetPayload` 不得直接作为 Domain 入参。API 负责查询、映射、编排、事务与 DTO 转换，映射只做字段搬运，不变成第二套算法。
- **模块边界**：`statements/` 不依赖具体 API service 或 Prisma 类型；`projection/` 不依赖具体报表实现；`statements/aggregates.ts` 只放真正跨报表共享的领域计算，不做万能工具文件；`xirr` 只在 `investment/` 内封装，第三方类型不出现在 Domain 导出面。
- **完整算法下沉**：搬的是整条计算流程，不是把 `add()` / `sub()` 包一层；每阶段按 roadmap 的六步走。
- **回归基线形态**：用测试内固定输入 + 迁移前输出快照（把旧实现的输出固化成期望值），**不在测试里长期同时调用新旧两份实现做对照**；一次性比对脚本不入仓库（§5.1）。
- **SQL 预聚合路径保留**：继续用 `groupBy` 聚合行交给 `summarizeAggregatedFlows`（§3.1），新增「聚合行结果 = 明细计算结果」的一致性用例；不得为对齐 Domain 而把整表明细读进内存。
- **口径与精度不改**：金额整数分、期间半开、派生值不落库、`rules.vN.ts` 版本化四条不动；不重写算法、不改业务口径、不增无关依赖、不建空目录。
- **不留双实现、不留兼容层**：旧链路不保留作回退，替换后当场删除；死代码（含仅被测试引用、无生产调用者的函数及其用例）在对应阶段统一删除（§5.1）。每阶段结束暂停汇报，等待确认再继续，不自动提交。

## 4. 命名

| 概念 | 统一用 | 禁止 |
|---|---|---|
| 一笔记录 / 分录 | `transaction` / `posting` | `record`, `bill` / `line`, `detail` |
| 账户 / 分类 | `account` / `category` | `wallet`, `card` / `class`, `tag` |
| 转账 / 退款 / 平账 | `transfer` / `refund` / `adjustment` | `move` / `reimburse` / `balanceFix` |
| 预算 / 快照 / 持仓 | `budget` / `snapshot` / `holding` | `plan`, `envelope` / `valuation` / `position` |
| 期初余额 | `initialBalance` | `openingBalance` |

- 类型不加 `Data/Info/DTO` 后缀；布尔用 `is/has/can`；缩写只允许 `id`、`db`、`api`、`ui`（禁 `tx/amt/cat`）。
- 中文只出现在文案与注释，标识符全英文；**一个概念只能有一个定义**，共享类型只在 `packages/contracts` 定义。

## 5. 文件与导出

- 一个文件一个主要导出，文件名 = 导出名；组件 `PascalCase.tsx`、hook `useX.ts`、其余 `kebab-case.ts`。
- 新组件用 `function Foo(props: FooProps)`，**不用 `React.FC`**；优先 named export；不新增 `index.ts` 桶导出（package 公共入口除外）。
- 弹层属性统一用 `visible`；注释中文、只写「为什么」，不复述代码。

### 5.1 改动即清理（硬性要求）

**每一次修改或重构结束时，本次改动产生的无用代码与文件必须当场删掉，不留到「以后再清」。** 被替换的旧实现、临时脚本、冗余依赖、同一含义的第二份实现，全部在同一次改动里删掉；删除前必须先确认零引用，不凭印象删。

```bash
# ESM 风格：源码写 ./foo.js、实际文件是 ./foo.ts，匹配前要先剥离后缀
grep -rn "symbolName" apps packages scripts --include="*.ts" --include="*.tsx"
```

新增功能时若发现别处已有一份等价实现（第二份口径、标签映射、日期格式化），一并收敛——这类漂移是「同一个数字两个答案」的来源。

### 5.2 两入口一份数据

设置页与报表页都能改账户 / 收支分类时，必须共用同一份 controller、表单组件与写操作链路：管理状态放共享 hook，**每个宿主各一个实例**（不进全局 Context）；展示配置（draft + 确认，落 localStorage）与账本数据（立即写库）不得共用底部动作区；写库成功后报表宿主必须重取当前报表、清掉指向已删除对象的下钻/折叠状态。禁止为第二个入口复制表单、校验或删除/转移流程。

### 5.3 反模式清单（code review 必查）

- ❌ 在组件 / route / service 里算钱；同一口径写两份（SQL 一份、JS 一份）；领域函数不给 service 留聚合路径。
- ❌ 用浮点存金额、用带时分秒的时间存交易日期；持久化余额、预算百分比、收益率。
- ❌ `res.data.data!` / `res.data.data ?? []`；失败时渲染 0 或空列表；用字符串 message 判断错误类型。
- ❌ 每个 mutation 手工列 `invalidateQueries`；`index.ts` 桶导出；schema 变更只 `db push` 不留迁移文件；备份格式不带版本号。
- ❌ 软删除过滤散落在各 service；查询量随总历史增长；同一概念两个名字。
- ❌ 跨期退款让「已用」变成负数；弹窗套弹窗；报表页里改配置。
- ❌ 用时间戳判断两条记录谁更新；用文件级 diff 做同步合并；同一东西写两份加密实现；冲突时两个版本都入账；把 SQLite 文件直接放网盘。
- ❌ 组件里写死用户可见文案（多语言的前提是「组件不写裸字符串」）。

## 6. 类型

- 开启 `strict`；禁止 `as` 断言，允许 `satisfies`。
- 边界处解析（`common/validators.ts`），内部信任类型。
- 后端 `tsconfig` 打开 `noUnusedLocals` / `noUnusedParameters`。
- API 响应类型统一放 `packages/contracts`，前端只 re-export，不内联 `ApiResponse<{...}>`。

## 7. API 与错误

### 7.1 响应信封

响应是**判别联合**：成功必有 `data`，失败必有 `error`（定义在 `packages/contracts/types/index.ts`）。后端由 `common/http.ts` 的 `success()` / `error()` 统一产出，前端只允许通过 `unwrapApiData` 消费。

错误码只有这几种，前后端共用，禁止自造：`VALIDATION_ERROR` / `NOT_FOUND` / `DUPLICATE_ERROR` / `FOREIGN_KEY_ERROR` / `CONFLICT` / `INTERNAL_ERROR` / `NETWORK_ERROR` / `UNKNOWN`。

### 7.2 请求 ID

每个请求由后端分配 ID，写入请求头、响应头（`x-request-id`）与错误响应体；**错误体必须带 `requestId`**，前端提示与后端日志用同一个 ID 对照（链路见 [architecture.md](architecture.md) §6）。

### 7.3 前端错误处理

- `services/apiError.ts` 把失败归一化为 `ApiClientError`（`code` / `status` / `details` / `requestId`）；`services/apiResult.ts` 的 `unwrapApiData(res)` 是**唯一**解包入口。
- **接口失败不得退化成 0 或空列表**：用 `ErrorPanel`（`features/shared/StateViews.tsx`）展示原因与重试；金额显示 `—`。报表查询若保留上次成功数据，失败时提示「刷新失败，当前显示上次数据」而不是清空。
- 4xx 不重试；5xx 与网络错误重试一次；切回窗口时刷新已过期数据。

### 7.4 路由

`GET /api/resources`（列表）/ `GET /api/resources/:id` / `POST` / `PUT /:id` / `DELETE /:id`。路由只做参数解析、校验、调用 service，禁止算钱；错误由 `errorHandler` 统一映射，业务错误抛 `AppError` 子类。**破坏性接口必须带确认值**：请求体带 `packages/contracts/constants.ts` 的 `CLEAR_CONFIRM`。

## 8. 数据库

- **访问只在 repository 层**：`apps/api/src/db/repositories/` 是各模型读写唯一入口，service / route 不得出现 `prisma.<model>.`，事务回调里的 `tx.<model>.` 同样禁止。repository 做纯委托，固定关联收成常量；「需要看已删除/全量」的方法名必须带 `IncludingDeleted`。
- **事务边界统一**：service 不得直接调 `prisma.$transaction`，统一用 `db/transaction.ts` 的 `withTransaction(fn)`。例外白名单：`$queryRaw` 仅查迁移元数据、迁移/种子脚本、`common/db.ts`、rollback 的 ATTACH/PRAGMA 原始 SQL。
- **连接初始化设 WAL 与 busy_timeout**：`prisma.ts` 启动执行 `PRAGMA journal_mode = WAL`（必须用 `$queryRawUnsafe`，该 PRAGMA 返回结果行）与 `busy_timeout = 5000`。写串行化只靠 `runExclusiveLongTask` 的串行队列（导入 / 导出 / 回滚恢复 / 自动备份严格串行），用户写入不进队列。验收见 `tests/integration/concurrent-write.test.ts`。
- **连接串必须显式**：`schema.prisma` 用 `env("DATABASE_URL")`，npm 入口经 `scripts/with-database-url.mjs` 注入默认开发库绝对路径；绕过 npm 直接运行时缺变量直接报错退出。脚本写真实库需 `--allow-real`（先自动备份并打印 SHA256）。
- **改 schema 一律走版本化迁移**：`npm run db:migrate`（SQL 提交进仓库），禁止只用 `prisma db push`。迁移名以时间戳开头 `YYYYMMDDHHMMSS_描述`；`db:status` 看差异、`db:deploy` 只应用已有迁移。测试库在系统临时目录按运行唯一创建，`tests/global-setup.ts` 用迁移重建模板、各文件复制独占副本。
- **`db:drill` 恢复演练**：导出 → 导入临时库 → 用领域层重算两边余额并对比。库内按 id 聚合、跨库按稳定键（账户名、分类路径、交易内容指纹）；导入会重建 id，不做 id 字节相等判定。改动导出/导入/余额逻辑后必须跑。
- **自动定时备份**：配置存数据库同级 `auto-backup-config.json`；输出加密容器 `moneybrain-backup-YYYY-MM-DD.mbx`。用户可配开关、目录、间隔（`intervalHours`，缺省 24）与保留份数（`keepCount`，缺省 7）；非法值返回 `VALIDATION_ERROR`。执行判定只有两条——距上次成功备份 ≥ 间隔、长任务锁空闲；两条都满足才跑（30 秒评估一次），失败后 10 分钟退避。与导入/导出/回滚共用同一把长任务锁。
- **不持久化余额、预算百分比、收益率**；投资快照 `previous_snapshot_id` 是写入顺序产物、继续持久化，但不进同步记录，应用后按本地规则重算（§3.4）。禁止读取时绕开快照链另算一套推导。
- **软删除**：`deletedAt` 过滤只允许出现在 `transaction.repository.ts`；撤销与回收站恢复依据 `audit_events` 反向写入，不另建撤销表。存在退款的原交易禁止删除；导出与备份必须排除已删除交易。
- **超退与跨账户退款合法**：可退余额 = max(原额 − Σ退款, 0) 只是录入参考；`db:verify` 对超退只做信息性提示。
- CSV 导入用 `Transaction.importKey` 去重，支持 `includes` 范围过滤；覆盖模式只清空所选范围，必须二次确认且在单事务内先清空再写入。

## 9. 测试要求

顺序 `domain → lint → typecheck → test`。新功能必须覆盖：领域（五类交易、退款方向、转账手续费、期初当天、期间边界）、API（happy path + 关键失败；超退与跨账户是合法路径）、页面（空态、错误态「失败不渲染 0」、移动布局）、可访问性（可访问名称与角色、装饰图标 `aria-hidden`、浮层关闭焦点回归）。详见 [testing.md](testing.md)。

### 9.1 提交前的自检清单

- [ ] 本次改动产生的无用代码与文件已删（§5.1），删掉的每个东西都确认过零引用。
- [ ] `npm run typecheck` 0 错误；`npm run lint` 0 错误（warning 可接受，但不要新增）。
- [ ] `npm run test` 全通过（`test:domain` / `test:sync` / `test:api` / `test:web`）。
- [ ] 动了前端页面 / 交互 → 额外跑 `npm run test:e2e`。
- [ ] 动了金额/口径/导入导出/余额逻辑 → 额外跑 `npm run db:verify` 与 `npm run db:drill`。
- [ ] D 批领域算法改动：迁移前后同输入 DTO 逐字段对照通过；旧实现确认零引用后已删除；Domain 未 import `packages/contracts` / `@prisma/client` / Express / `apps/**`，且 `npm run typecheck:domain` 单独通过。
- [ ] 动过统计口径：`summarizeAggregatedFlows` 与明细汇总的一致性用例通过，SQL `groupBy` 路径未退化成读整表。
- [ ] D6：`npm run test:domain` 含真实 `xirr` 运行用例（CJS / ESM 互操作 + 数值结果），`apps/api` 无第三方 XIRR 直接调用。
- [ ] 改了 schema → 迁移文件已生成，`npm run db:status` 无差异；额外跑 `npm run test:integration -w @moneybrain/api`。
- [ ] 新特性按最小可用实现（[roadmap.md](roadmap.md) §5）：新增开关 / 配置项 / 机制前先问「能不能等真实需求出现再补」。
- [ ] 旧实现与新设计冲突时，先判断「保留兼容是否会产生第二套口径 / 第二条路径」——会就不兼容，直接删旧路径。
- [ ] 前端按当前 feature 结构写：页面只在 `features/<domain>`，跨域组件只在 `features/shared`；不新建 `pages/`、`queries/`、`ui/`、`hooks/` 目录，不为旧结构写适配层。能在后端 / 契约层收口的就在后端收口，但契约与后端必须做完整。
- [ ] 新增 / 被修改的用户可见文案已进文案目录（key `feature.page.element[.state]`，只用 `{}` 插值）。
- [ ] 提交信息首行含「——」且括号内是条目号 / 哈希 / 重写批次（`commit-msg` 钩子会自动拦，这步是 `--no-verify` 场景的兜底）。
- [ ] 文档与代码注释里的文档路径同步更新；过时文档直接删除，不留历史副本。

## 10. Git 与端口

- 禁止自动 commit/push，除非用户明确要求。
- **一次提交做一件事**：一个功能或一次口径改造算一件事，它顺带产生的代码精简（删旧实现、删死代码、删冗余依赖、合并重复实现）属于同一件事，在同一次提交里完成。只有与本次改造无关的清理才单独开一次提交。提交信息用中文，说明「做了什么 + 为什么」。
- 提交前确认工作区没有残留的临时文件与调试产物。
- 后端 3001，前端 3002（Vite 代理 `/api` → 127.0.0.1:3001）；生产预览 4173；**Electron 桌面端用空闲随机端口**，见 [architecture.md](architecture.md) §9。
- API 默认只监听 `127.0.0.1`；需要局域网访问时显式设置 `HOST=0.0.0.0`，并用 `CORS_ORIGINS` 配置允许来源（逗号分隔）。

### 10.1 提交信息格式（所有会话统一）

首行格式：

```
<类型>：<做了什么>——<为什么 / 影响>（<条目号或哈希>）
```

- 类型白名单固定为英文六个前缀：`feat`（功能 / 口径落地）、`fix`（修 bug 或数据修复）、`refactor`（结构调整、不改行为）、`perf`（性能与索引）、`docs`（文档、条目登记 / 销条目）、`chore`（领条目、依赖与杂务）。
- 冒号一律用全角 `：`，冒号后空一格；禁止 `feat(api):`、`docs(ux):` 这类 conventional 括号风格，也不要用半角 `:`。
- 首行建议 ≤ 50 个汉字；条目号写 `（L1）`，引用提交写 `（777fd70）`，不要塞进长句。
- 正文按需写三段，每段 1–3 行：`根因：…`、`改法：…`、`验证：<命令> → <结果>`；没有对应内容就省略。
- 合法 / 不合法对照：
  - 合法：`fix：导出文件名改用本地日历日——UTC+8 凌晨会落到前一天（A5）`
  - 不合法：`fix：导出文件名改用本地日历日（A5）`（缺 `——`）
  - 不合法：`fix: 导出文件名改用本地日历日——原因（A5）`（半角冒号）
  - 不合法：`docs(ux)：主题 token 调整——原因（UX5b）`（带作用域）
- 括号注记接受条目号、提交哈希、`重写批次`、`§10.1`；钩子只校验格式。
- 本仓库已启用 `commit-msg` 钩子（`.githooks/commit-msg`）。新克隆需执行一次 `git config core.hooksPath .githooks`；`git commit --no-verify` 可绕过，但不要用。

**所有会话（含并行会话）的提交一律按此模板。**

- **并行会话共用工作区时**：只改自己条目对应的文件与行；提交前 `git diff --cached -U1` 逐行核对，不得带入他人未提交改动；不得整文件翻转行尾（`.gitattributes` 已统一 LF）。

## 11. 设计文档

界面视觉、交互、双端差异与「未来报表」口径的唯一来源是 [ui-design.md](ui-design.md)；token 实现落在 `styles/theme/{variables.css,hf-theme.ts}`，不得另建第二套。一次性走查脚本放系统临时目录、不入仓库（见 §5.1）；原型验证用几何测量（`getBoundingClientRect`）而非肉眼看图。
