# MoneyBrain 架构

## 1. 总览

```
React SPA (apps/web)
   │  React Query + Axios
   ▼
Express API (apps/api)
   │  参数校验 / 编排 / 事务
   ▼
packages/domain（纯函数）
   ├─ money.ts      整数分
   ├─ date.ts       LocalDate + 半开区间
   ├─ ledger/       交易 → 分录 → 余额/收支/预算
   └─ tests/        不变量与回归用例
   │
   ▼
Prisma → SQLite
```

领域层不依赖 React、Express、Prisma。API 只负责取数、调用领域函数、组装 DTO。

## 2. 记账内核

### 2.1 交易 → 分录

```
income     账户 +amount        分类 -amount
expense    账户 -amount        分类 +amount
transfer   转出 -(本金+手续费)  转入 +本金   手续费 +有效手续费
refund     支出退款 账户 +amount；收入退款 账户 -amount
adjustment 账户 +amount        权益 -amount
```

所有金额影响都由 `postingsOf()` 产生，余额、报表、预算消费同一组分录。

### 2.2 核心函数

| 函数 | 用途 |
|---|---|
| `postingsOf(tx)` | 单笔交易的分录 |
| `balanceAt` / `balanceBefore` | 账户余额 |
| `summarizeFlows` | 收入、支出、退款、净额 |
| `flowByCategory` | 分类明细 |
| `budgetUsage` | 预算已用（含退款冲减） |
| `remainingRefundable` | 可退余额 |

### 2.3 不变量

1. 每笔交易的分录之和为 0。
2. 期末净资产 − 期初净资产 = 净收入 − 净支出。
3. 转账：`Δ转出 + Δ转入 = −手续费`。
4. 全额退款后余额回到原交易前。
5. 同一笔交易在余额/收支/预算中的归属可追溯到同一条分录。

## 3. 后端模块

| 模块 | 职责 | 与领域层关系 |
|---|---|---|
| `account.service` | 账户 CRUD、余额查询 | 调用 `calculateBalancesBatch` |
| `transaction.service` | 交易创建/更新/退款 | 退款上限校验 |
| `balance.service` | 批量余额 | 直接使用 `balanceBefore` |
| `budget.service` | 预算 CRUD、状态、预测 | 期间用 domain，状态已接账户/退款 |
| `report/` | 四张报表 | 收支表使用净额 + 退款口径 |
| `import/export/` | CSV/配置导入导出 | 幂等键、范围过滤、覆盖确认已落地 |
| `investment/` | 快照与收益分析 | 保存/编辑/删除后重排前链；未分类差额允许保存 |
| `common/` | 错误、HTTP、日期、日志 | `date.ts` 仅保留边界转换 |

## 4. 前端数据流

```
Page → queries/useXxx → services/api.ts → Axios → Express
                                      ← ApiResponse<T>
```

- 服务端状态：React Query。
- 客户端状态：组件本地 state + URL 参数，无 Zustand。
- 样式：CSS 变量 + AntD token；财务色与信息色语义分离。

## 5. 数据库

当前模型：`AccountCategory`、`Account`、`TransactionCategory`、`Transaction`、
`Budget`、`InvestmentAssetClass`、`InvestmentAllocationSnapshot`、
`InvestmentAllocationItem`。

目标模型（见蓝图）：

- 交易只存 `occurred_on`（日期）。
- 增加 `postings` 表，交易与分录分离。
- 删除 `previousSnapshotId` 等派生字段。
- 金额改为整数分（或保留 Decimal 但只作存储）。

## 6. 迁移状态

已落地：

- npm workspaces 与目录迁移：`apps/api`、`apps/web`、`packages/contracts`。
- 领域核心与测试。
- 余额：期初当天、退款方向、转账手续费。
- 预算：半开区间、账户/退款口径。
- 退款：上限校验、编辑金额还原、有退款的原交易禁止删除。
- 收支表：未分类节点。
- CSV 导入幂等键；统一 `ledger` 查询失效入口。
- 首页汇总、趋势、分类占比统一走领域层，退款按原类型冲减。
- 导入范围过滤、覆盖导入二次确认、按范围清空与配置覆盖保护。
- CSV 导出保留「不计收支」标记、稳定 ID、固定时间格式与调整方向。
- 投资快照前链重排、日期唯一校验、未分类差额允许保存。
- 现金流量表展示未分类活动。
- API 默认只监听 `127.0.0.1`，CORS 使用本地前端白名单。

未落地：

- `packages/db` / `packages/ui` 拆包。
- 交易写入的本金/手续费统一（目前仅转账分离）。
- 导入回滚点、报表对账、鉴权。
- 前端 feature 切片与设计系统包装层。
- `packages/contracts` 的 zod schema 与请求/响应契约。

详见 [rewrite-blueprint.md](rewrite-blueprint.md) 与 [audit-report.md](audit-report.md)。
