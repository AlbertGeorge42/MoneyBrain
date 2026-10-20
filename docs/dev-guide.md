# MoneyBrain 开发规范

> 目标架构见 [rewrite-blueprint.md](rewrite-blueprint.md)。本文件描述**当前代码事实**与**新代码必须遵守的规则**。

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、Vite 5、TypeScript、Ant Design 6、ECharts、TanStack Query、Axios |
| 后端 | Express 4、TypeScript、Prisma 5、SQLite、pino |
| 领域内核 | 纯 TypeScript（`packages/domain`，无框架/数据库依赖） |
| 测试 | Vitest、React Testing Library、Supertest、Playwright、Node Test Runner |

## 2. 当前目录

```
apps/api/src/
├── routes/               # 参数校验 + 委托 service
├── services/             # 业务编排；余额/预算已接入 domain
├── common/               # 错误、HTTP、日期、日志
└── prisma.ts

apps/web/src/
├── pages/                # 页面
├── components/           # 领域组件
├── queries/              # React Query hooks
├── services/api.ts       # Axios + API 对象
└── styles/               # 设计令牌 + 页面样式

packages/domain/
├── src/money.ts          # 整数分金额
├── src/date.ts           # LocalDate + 半开区间
├── src/ledger/types.ts   # 交易、分录
├── src/ledger/postings.ts# 交易 → 分录 → 账户余额
├── src/ledger/summary.ts # 收支汇总、分类汇总、预算用量、可退金额
└── tests/

packages/contracts/       # 前后端 API 类型、树工具
```

## 3. 领域层规则（最高优先级）

### 3.1 算钱只能有一个实现

```ts
// apps/api/src/services 下的真实导入路径
import { postingsOf, summarizeFlows, budgetUsage } from '../../../../packages/domain/src/index.js'
```

后端暂时用相对源码路径导入领域包，避免开发期额外构建；构建时 `tsc` 会把
`packages/domain` 一起编译到 `apps/api/dist/packages/domain`。

根目录 `npm run build` 由 `scripts/build.mjs` 串行构建；在 Windows 上会把
`TEMP`/`TMP` 指向仓库内临时目录，避开 esbuild 清理系统临时文件的权限问题。

- 余额：`balanceAt` / `balanceBefore`（通过 `postingsOf`）
- 收支：`summarizeFlows`、`flowByCategory`
- 预算：`budgetUsage`
- 退款上限：`remainingRefundable`

禁止在组件、route、service 中复制：

```ts
// ❌ 禁止
if (type === 'refund') amount = +amount
if (type === 'transfer') toAmount = amount - fee
```

### 3.2 金额

| 场景 | 规则 |
|---|---|
| 领域层 | 整数分 `Minor` |
| Prisma / API | `Decimal` 或 number（元） |
| 换算 | 只在适配层：`fromMajor` / `toMajor` |
| 禁止 | 领域层出现 `parseFloat`、`toFixed`、`Decimal` |

### 3.3 日期

- 领域层只认 `LocalDate`（`YYYY-MM-DD`）。
- 期间一律半开：`start <= date < endExclusive`。
- 交易日期不存时分秒；`createdAt` 只用于审计。
- 禁止 `new Date('YYYY-MM-DD')`（UTC 偏移）和 `23:59:59.999`。

### 3.4 交易金额语义

| 类型 | `amount` 含义 | `fee/coupon` |
|---|---|---|
| `income` | 净收入（已折算） | 冗余展示 |
| `expense` | 净支出（已折算） | 冗余展示 |
| `refund` | 实际退回/退出的现金 | 冗余展示 |
| `transfer` | **本金** | 单独参与转出计算 |
| `adjustment` | 余额增量 | 无 |

### 3.5 期初余额

期初余额 = **期初日期当天开始前**的余额。当天交易照常计入。
查询日期早于期初日期时，账户尚未存在，余额为 0。

## 4. 代码风格

### 4.1 命名

| 概念 | 统一用 | 禁止 |
|---|---|---|
| 一笔记录 | `transaction` | `record`, `bill` |
| 分录 | `posting` | `line`, `detail` |
| 账户 | `account` | `wallet`, `card` |
| 分类 | `category` | `class`, `tag` |
| 转账 | `transfer` | `move`, `remit` |
| 退款 | `refund` | `reimburse`, `return` |
| 平账 | `adjustment` | `balanceFix` |
| 预算 | `budget` | `plan`, `envelope` |
| 快照 | `snapshot` | `valuation` |
| 持仓 | `holding` | `position` |
| 期初余额 | `openingBalance` | `initialBalance`（存量除外） |

- 类型不加 `Data/Info/DTO` 后缀；布尔用 `is/has/can`。
- 缩写只允许 `id`、`db`、`api`、`ui`；禁止 `tx/amt/cat`。
- 中文只出现在文案与注释，标识符全英文。

### 4.2 文件与导出

- 一个文件一个主要导出，文件名 = 导出名。
- 组件 `PascalCase.tsx`；hook `useX.ts`；其余 `kebab-case.ts`。
- 新组件用 `function Foo(props: FooProps)`，不用 `React.FC`；优先 named export。
- 不新增 `index.ts` 桶导出（包公共入口除外）。

### 4.3 类型

- 开启 `strict`；领域包额外开启 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。
- 边界处解析（zod/校验器），内部信任类型。
- 禁止 `as` 断言，允许 `satisfies`。

## 5. API 与数据库

### 5.1 响应

```ts
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string; details?: unknown }
  timestamp: string
}
```

### 5.2 路由

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/resources` | 列表 |
| GET | `/api/resources/:id` | 详情 |
| POST | `/api/resources` | 创建 |
| PUT | `/api/resources/:id` | 更新 |
| DELETE | `/api/resources/:id` | 删除 |

- 路由只做参数解析、校验、调用 service；禁止算钱。
- 错误由 `errorHandler` 统一映射；业务错误抛 `AppError` 子类。

### 5.3 数据库

- SQLite，Prisma；金额 `Decimal`，ID `uuid`。
- 修改 schema 后运行 `npx prisma db push --schema apps/api/prisma/schema.prisma`；测试库由 `tests/global-setup.ts` 自动同步。
- 不持久化余额、预算百分比、快照前链、收益率。
- 交易删除是硬删除；退款通过 `relatedTransactionId` 关联。存在退款的原交易禁止删除，避免孤儿退款。
- CSV 导入用 `Transaction.importKey` 去重；同一文件或数据库已存在的记录会跳过。
- 导入支持 `includes` 范围过滤；覆盖模式只清空所选范围。独立配置覆盖若仍有未纳入范围的交易/预算/快照会被拒绝。
- 覆盖导入必须二次确认；CSV 覆盖在单个事务内先清空再写入。

## 6. 测试

顺序：`domain → lint → typecheck → test`。

```bash
npm run test:domain
npm run test:api
npm run test:web
npm run test:e2e
```

新功能必须覆盖：
- 领域：五类交易、退款方向、转账手续费、期初当天、期间边界。
- API：happy path + 关键失败（退款超额、预算边界）。
- 页面：空态、错误态、移动端布局。

## 7. 迁移状态

已完成：

- npm workspaces + 目录迁移：`apps/api`、`apps/web`、`packages/contracts`
- `packages/domain`（金额/日期/分录/汇总）
- 余额计算接入领域层，修复期初当天、退款方向、转账手续费
- 预算期间改为半开区间，并接入账户/退款口径
- 退款金额上限校验；有退款的原交易禁止删除
- 退款编辑金额还原
- 收支表未分类节点
- CSV 导入幂等键与重复跳过
- 导入范围过滤、覆盖确认、按范围清空、配置覆盖保护\n- CSV 导出固定时间格式，保留不计收支与调整方向
- 首页汇总/趋势/分类占比接入 domain，退款冲减口径统一
- 投资快照前链重排；未分类差额不再阻断保存
- 现金流量表展示未分类活动
- 统一 `ledger` 查询失效入口
- API 仅监听本机，CORS 白名单化

待完成（按优先级）：

- 交易写入全面改为本金 + 手续费分离（转账已完成，收支仍为净额）
- `packages/db`、`packages/ui` 拆包
- 导入覆盖确认/回滚、快照链、报表对账、鉴权
- 前端 feature 切片、设计系统包装层
- `packages/contracts` 引入 zod，成为请求/响应唯一契约

## 8. Git 与端口

- 禁止自动 commit/push，除非用户明确要求。
- 后端 3001，前端 3002（Vite 代理 `/api` → 127.0.0.1:3001）。
- API 默认只监听 `127.0.0.1`；需要局域网访问时显式设置 `HOST=0.0.0.0`，并用 `CORS_ORIGINS` 配置允许来源（逗号分隔）。
