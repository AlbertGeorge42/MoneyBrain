# MoneyBrain 产品 / UX / 架构 / 财务数据审计报告

- 审计对象：`C:\Users\George\Documents\MoneyBrain`，代码基线 commit `39b3ba2`（工作区无改动）
- 路径说明：本报告记录审计时快照，当时目录为 `backend/`、`frontend/`、`shared/`；现已迁移到 `apps/api/`、`apps/web/`、`packages/contracts/`，文中旧路径按 1:1 对应理解。
- 审计方式：源码静态通读 + 针对性逻辑推演（未启动应用、未造数据）。每个结论都给出代码锚点；依赖运行时语义（SQLite 外键行为、Prisma 默认 `onDelete`）的结论标注为「待运行时复核」。
- 严重度定义：
  - **P0**：财务数据错误 / 数据丢失 / 安全问题，会导致用户看到错误的钱
  - **P1**：关键流程被阻断或核心行为与语义不符
  - **P2**：显著的 UX / 信息架构 / 可理解性 / 一致性缺陷
  - **P3**：视觉、效率、低风险改进

---

## 0. 结论摘要

| 严重度 | 数量 | 主题 |
|---|---|---|
| P0 | 3 | 初始余额日静默吞掉当天交易；收入退款方向错误；转账手续费凭空消失 |
| P1 | 10 | 预算周期末日/账户维度/退款抵扣；导入去重与「覆盖」语义；退款编辑与孤儿退款；投资快照链；首页口径与缓存；报表明细对不上账；无鉴权 |
| P2 | 6 | 无查询错误态；缓存失效不全；预算下钻丢条件；无新手引导；备份能力弱；导出丢字段 |
| P3 | 6 | 录入效率、预算进度截断、报表口径切换、重复/死参数清理、视觉一致性、批量操作 |
| 结构与命名（第 7、8 节） | P2×3 / P3×10 | 模块边界不一致、类型无单一来源、无意义抽象；详见第 7、8 节，不重复计入上表 |

一句话结论：**架构分层、类型共享、设计令牌、余额批量缓存这些“骨架”做得不错；真正的问题集中在一层薄但致命的“金额语义层”**——`refund` / `transfer` / `initialBalanceDate` 的符号与日期边界没有被统一定义，导致同一笔钱在「账户余额」「收支表」「现金流量表」「预算」「投资分析」里各算一遍。

---

## 1. P0 财务数据错误

### P0-1 新建账户默认 `initialBalanceDate = 今天`，且「初始余额日当天的交易」被永久排除在余额之外

**证据**

- 后端默认值：`backend/src/services/account.service.ts:73-75`
  ```ts
  initialBalanceDate: data.initialBalanceDate
    ? new Date(`${data.initialBalanceDate}T00:00:00`)
    : new Date(),        // ← 未传时 = 当前时刻（带时分秒）
  ```
- 前端默认值：`frontend/src/components/settings/AccountConfigModal.tsx:135` 与 `:143` 均写入 `dayjs()`（今天）。
- 排除当天交易的算法：`backend/src/services/balance.service.ts:64-98`
  ```ts
  if (targetDate >= initialDateNextDay) {
    dateRange: { gte: initialDateNextDay, lt: targetDate }  // 不含 initialDate 当天
  } else if (targetDate < initialDate) { /* backward */ }
  else { return null }   // ← (initialDate, initialDate+1d) 这个 24 小时窗口直接返回初始余额
  ```
- 触达面：`income-expense.service.ts:215-238` 用 `calculateBalancesBatch` 算期初/期末净资产。

**用户影响**

1. 用户新建账户（初始余额 1000）→ 当天记一笔支出 200 → 账户余额、资产负债表、首页净资产**仍然是 1000**，第二天才变成 800。用户会认为"记账没生效"。
2. 更严重的是**报表内部自相矛盾**：收入支出表的「收入/支出」直接对交易求和，含当天交易；而「期初/期末净资产」走余额缓存，不含当天交易。于是 `资产变动 ≠ 收入 − 支出`，报表无法对账。
3. 后端默认值带时分秒、前端显式传值时是 00:00:00，两者产生**不同的日期边界**，行为不可预测。

**建议修复**（需要产品先定义语义，建议二选一）
- 方案 A（推荐）：把「初始余额日」明确定义为**账户余额的起始时点，该日交易另计**，但余额计算改为 `gte: initialDate`（含当天），并在 UI 文案标注"初始余额为 X 日开始时余额"。
- 方案 B：保留"期末余额"语义，但**强制用户显式选择日期**（不再默认今天），且默认值取"昨天"，同时在账户表单展示解释。
- 无论哪种：后端去掉 `new Date()` 兜底，未传值时报 `ValidationError`；日期一律按本地日历日 00:00:00 归一。

**改动范围**

`backend/src/services/balance.service.ts`、`backend/src/services/account.service.ts`，以及所有复用该日期语义的报表服务；`frontend/src/components/settings/AccountConfigModal.tsx`、`AccountForm.tsx`。

**验收标准**

- 新建账户当天记账后，账户余额、资产负债表、首页净资产、收入支出表净资产变动四者一致；
- `资产变动 == 收入 − 支出` 在同一报表内成立（含当天交易）；
- 新增单元测试：`initialBalanceDate = D`，交易日期 = D / D+1 / D-1 三种情况的余额断言。

**验证方式**：代码级已验证（日期分支逻辑可直接读出）。

---

### P0-2 收入退款的余额方向错误：退款一律 `+amount`，但收支表按"冲减收入"处理

**证据**

- 余额方向：`backend/src/services/balance.service.ts:21-22`
  ```ts
  case 'refund':
    return amount      // ← 不看 relatedType，全部当作"钱流入账户"
  ```
- 收支表口径：`backend/src/services/report/income-expense.service.ts:44-61`，收入退款 `aIncomeRefund` 从 `netIncome` 中**扣减**。
- 交易列表统计同样按"冲减"：`backend/src/services/transaction.service.ts:441-462`。
- 前端允许对收入发起退款：`frontend/src/components/transactions/TransactionDetail.tsx:34`
  ```ts
  const canRefund = transactionType === 'income' || transactionType === 'expense'
  ```

**用户影响**

- 支出发起退款（如退货）→ 钱回到账户：`+amount` ✅ 正确。
- **收入发起退款**（如收到的钱被退回）→ 钱应该**离开**账户，实际却是 `+amount`，等于凭空多出一笔钱，净资产虚增。
- 同时收支表把收入退款当作"收入减少"，于是"报表说收入减少、余额却增加了"——两处口径直接冲突。
- 退款的"分类汇总"也受影响：未分类退款只进 `incomeByCategory/expenseByCategory`，不进明细树（见 P1-8），误差叠加。

**建议修复**

```ts
case 'refund':
  return relatedType === 'income' ? amount.negated() : amount
```
并让 `income-expense.service` / `transaction.service` / `cash-flow` 全部改用同一个 `calculateBalanceChangeDecimal`，禁止各自实现口径。

**改动范围**

`balance.service.ts`（函数签名需接收 `relatedType`）、`applyTransactionsToBalance`、`cash-flow-aggregate.ts`、`income-expense.service.ts`、`transaction.service.ts`，以及所有查询 `type: 'refund'` 的 `select`（需带上 `relatedType`）。

**验收标准**

- 对收入/支出两类退款分别断言：账户余额变动 == 收支表中对应方向的净额变动；
- 退款后净资产变动 = 报表净收入变动，方向一致；
- 现金流量表中收入退款为**流出**、支出退款为**流入**。

**验证方式**：代码级已验证（符号分支缺失可直接读出）。

---

### P0-3 转账手续费被同时计入转出与转入，手续费不减少资产

**证据**

- 前端把 fee/coupon 合并进 `amount`：`frontend/src/utils/transaction.ts:77`
  ```ts
  // expense / transfer
  return amount + (fee || 0) - (coupon || 0)
  ```
- 后端转出：`balance.service.ts:19-20` → `-amount`（已含 fee）。
- 后端转入：`balance.service.ts:30-37`
  ```ts
  export function calculateTransferInAmountDecimal(amount, _fee, _coupon) {
    return amount     // ← fee 参数被忽略，转入金额 == 含手续费的 amount
  }
  ```
- 现金流量表同样：`cash-flow-aggregate.ts:92-108`，outflow 与 inflow 都取同一个 `amount`。
- 投资分析"取出/买入"金额也含 fee：`investment-analysis-collect.ts:70-92`。

**用户影响**

场景：从 A 账户转 100 到 B，手续费 5。
- 期望：A = −105，B = +100，净资产 −5。
- 实际：A = −105，B = **+105**，净资产 ±0。**5 元手续费凭空变成 B 的资产**，且没有任何地方记为费用。
- 转入账户余额长期偏高，转账次数越多偏差越大；现金流量表按转账分类也各边虚增 5。

**建议修复**

拆分"本金"与"手续费"两个概念：`amount` 只存用户输入的本金，`fee/coupon` 独立存储（schema 已有字段）。
- 转出侧变动 = `-(amount + fee - coupon)`
- 转入侧变动 = `+amount`
- 手续费在现金流量表/收支表中体现为费用（或明确"转账手续费不计收支"并单独展示）。
同时删除 `calculateTransferInAmountDecimal` 中已失效的 `_fee/_coupon` 参数，避免后人误以为已处理。

**改动范围**

`utils/transaction.ts`（停止把 fee 并入 amount）、`balance.service.ts`、`cash-flow-aggregate.ts`、`investment-analysis-collect.ts`、`transaction.service.ts` 的 `createTransfer/updateTransfer`，以及 `shared/types` 中相关金额注释。

**验收标准**

- 转账含手续费后：`ΔA + ΔB == -fee`；
- 现金流量表 outflow − inflow == fee；
- 投资账户"取出"金额等于本金，不含手续费；
- 单测覆盖 fee=0 / fee>0 / coupon>0 三种组合。

**验证方式**：代码级已验证（`_fee` 未使用 + 前端合并逻辑可交叉印证）。

> **关联**：`docs/todo.md:2` 已把"优惠券和手续费没有参与普通交易"标记为完成。功能确实接上了，但采用的"把 fee 合并进 amount"方案正是 P0-3 与 P1-5 的根因，建议一并回退重构。

---

## 2. P1 关键流程 / 核心行为

### P1-1 预算周期末日 00:00 之后的交易被排除（monthly / quarterly / yearly）

**证据**：`backend/src/services/budget.service.ts:84-129`
```ts
case 'daily':   endDate = new Date(y, m, d, 23, 59, 59, 999)   // ✅ 含全天
case 'weekly':  weekEnd.setHours(23, 59, 59, 999)              // ✅ 含全天
case 'monthly': endDate = new Date(y, m + 1, 0)                // ❌ 00:00:00
case 'quarterly': endDate = new Date(y, (quarter + 1) * 3, 0)  // ❌ 00:00:00
case 'yearly':  endDate = new Date(y, 11, 31)                  // ❌ 00:00:00
```
查询用 `lte: endDate`：`budget.service.ts:257-265`。

**用户影响**：月度/年度预算在"最后一天"（如 3/31、12/31）白天发生的消费**不计入预算使用额**，月末/年末预算看起来没超支，实际超了。

**建议修复**：抽出统一的 `endOfDay()`，所有周期的 endDate 一律取 `23:59:59.999`（或统一改为半开区间 `[start, nextStart)`）。

**改动范围**：`budget.service.ts`（`getPeriodRange`），并检查 `generateTimePoints` 是否同源。

**验收标准**：末日 23:59 的交易计入预算；单测覆盖 5 种周期的边界日。

---

### P1-2 预算用量不按账户/日期范围过滤，且不抵扣退款

**证据**：`backend/src/services/budget.service.ts:257-265`
```ts
where: {
  type: budget.type,
  date: { gte: dateRange.startDate, lte: dateRange.endDate },
  categoryId: { in: categoryIds },
  excludeFromIncomeExpense: false,
}   // ← 没有 accountId / toAccountId / budget.startDate / budget.endDate
```

**用户影响**

- 绑定"招行卡"的餐饮预算，会把现金/其他卡的同分类支出也算进去，**多账户用户预算必然误报超支**。
- 预算自身配置的 `startDate/endDate` 被忽略，过期预算仍在按当前周期统计。
- 退款不抵扣：支出退款后预算用量不下降，用户"退了款还是超支"。

**建议修复**：按 `budget.accountId`（转账预算用 `toAccountId`）过滤；叠加 `budget.startDate/endDate` 与当前周期的交集；对 `refund` 按 `relatedType` 反向抵扣。

**改动范围**：`budget.service.ts`（`getBudgetStatusesByIds`），必要时抽取与报表共用的聚合函数。

**验收标准**：多账户场景下预算只统计所属账户；支出退款后用量下降；预算生效期外的交易不计入。

---

### P1-3 导入缺去重、CSV「覆盖」模式不清空、`includes` 被忽略

**证据**

- 每次导入生成新 UUID，无任何去重：`transaction-import.service.ts:493`、`:564` 均为 `crypto.randomUUID()`。
- CSV 覆盖模式无效：`smart-import.service.ts:80-84`
  ```ts
  const transactionResult = await importTransactionsFromCsv(file, undefined, undefined)
  // mode 参数完全没被使用
  ```
- 前端根本不传 `includes`：`frontend/src/components/settings/DataBackupSection.tsx:133`
  ```ts
  await dataApi.importBackup(importFile, { mode: importMode })   // 只有 mode
  ```
  后端 `data.route.ts:86-92` 也只读 `mode`。
- 导出丢字段：`transaction-export.service.ts:33` 表头有「账单标记/已报销/标签/账单图片」，但 `:63-65` 硬编码为空字符串。

**用户影响**

- 重复导入同一份 CSV → **交易重复、统计翻倍**，且用户无从发现（没有去重提示）。
- 选了"覆盖"却只是追加，用户以为数据被替换了。
- 备份→恢复后，`excludeFromIncomeExpense`（不计收支）、标签、图片等标记**全部丢失**，报表口径改变，属于静默数据破坏。
- 导出时间用 `toLocaleString('zh-CN')` + 手工替换斜杠（`:37-39`），跨语言环境/跨时区可能解析失败。

**建议修复**

- 导入引入稳定业务键去重（`日期 + 类型 + 金额 + 账户 + 分类 + 备注`），重复项计入 `skipped` 并在结果里明示。
- CSV 覆盖模式真正先清空交易（复用 `clearTransactionsOnly`），且在事务内执行。
- `import-backup` 接收并遵守 `includes`；前端把选择结果传过去。
- 导出补全 `excludeFromIncomeExpense / tags / images` 列，改回机器可读的 ISO 时间格式。

**改动范围**：`transaction-import.service.ts`、`smart-import.service.ts`、`data.route.ts`、`transaction-export.service.ts`、`DataBackupSection.tsx`、`api.ts`。

**验收标准**：同一文件连续导入两次，第二次 `imported = 0`；覆盖模式后交易数与文件一致；导出→导入后 `excludeFromIncomeExpense` 等标记保持不变；新增往返（export→import）回归测试。

**验证方式**：代码级已验证；重复导入行为建议运行时复核一次。

---

### P1-4 「覆盖」导入无二次确认；仅配置覆盖会删账户但保留交易

**证据**

- 直接调用、无 `Popconfirm/Modal.confirm`：`DataBackupSection.tsx:123-133`，按钮绑定在 `:270-271`；`mode` 单选在 `:235-239`。
- `clearConfigDataForImport` 删账户但不删交易：`clear-data.service.ts:10-17`
  ```ts
  await tx.investmentAssetClass.deleteMany()
  await tx.account.deleteMany()          // ← transaction 仍引用 account
  ...
  ```
- `Transaction.account` 关系未声明 `onDelete`：`backend/prisma/schema.prisma:85`（Prisma 必填关系默认 `Restrict`）。

**用户影响**

- 一键点下去即清空全部数据，**没有任何确认步骤**，误触即数据丢失（且无回收站）。
- 只导入 config 的覆盖模式，在已有交易的情况下会因外键约束失败或留下悬空引用，事务回滚导致"导入失败"，用户无法完成恢复。
- 清空后没有自动备份/快照，属于不可逆操作。

**建议修复**：破坏性操作统一走 `Modal.confirm`（文案写明将删除的对象与数量）；`clearConfigDataForImport` 在覆盖配置前先处理交易（或明确禁止：配置覆盖要求先清空交易并提示）；覆盖前自动导出当前数据作为回滚点。

**改动范围**：`DataBackupSection.tsx`、`clear-data.service.ts`、`config-import.service.ts:379-380`。

**验收标准**：覆盖导入必须二次确认；仅配置覆盖在存在交易时给出明确错误或安全降级；确认后若失败，原有数据完好。

**验证方式**：代码级已验证；外键冲突建议运行时复核（SQLite 实际行为）。

---

### P1-5 退款金额换算缺失：创建退款不折算手续费，编辑退款每次都会改变金额

**证据**

- 创建退款走"裸值"，绕过 `formatTransactionSubmitValues`：`TransactionEdit.tsx:108-121`
  ```ts
  const refundData = { ...values, date: values.date.format('YYYY-MM-DD') }
  ```
- 编辑已有退款同样不走换算：`TransactionEdit.tsx:65-78`，直接 `amount: values.amount`。
- 但表单回填会对已存值做**反向换算**：`TransactionForm.tsx:85-90` 调用 `reverseComputeOriginalAmount`，而该函数对 refund 是 `stored + fee − coupon`（`utils/transaction.ts:97-98`）。

**用户影响**：一笔 `amount=100, fee=5` 的退款，每次"打开编辑 → 保存"都会变成 105、110、115……金额单调增长，且用户看不到任何提示。这直接篡改历史财务数据。

**建议修复**：退款与其他类型统一走 `formatTransactionSubmitValues`（或在退款路径显式做 `computeRealAmount`），并保证"回填换算"与"提交换算"互为逆运算。

**改动范围**：`TransactionEdit.tsx`、`utils/transaction.ts`、`TransactionDrawer.tsx`（退款提交链路）。

**验收标准**：退款创建/编辑各操作一次后，存储金额不变；`parse(format(x)) == x` 的属性测试通过。

---

### P1-6 退款与原交易的完整性缺口（孤儿退款、金额可超原额、账户可不同、可给转账打退款）

**证据**

- 关系为 `SetNull`：`schema.prisma:93`
  ```prisma
  relatedTransaction Transaction? @relation("TransactionRefund", fields: [relatedTransactionId], references: [id], onDelete: SetNull)
  ```
- 退款创建无任何业务校验：`transaction.service.ts:185-215`（未校验金额 ≤ 原额、账户一致、`relatedType ∈ {income, expense}`）。
- 删除交易无退款联动：`transaction.service.ts:496-500`。

**用户影响**

- 删除原交易后，退款仍存在并继续影响余额与报表，成为无法追溯的孤儿记录；其 `relatedType` 仍生效，报表继续扣减一个已不存在的收入/支出。
- 退款金额可以大于原交易，等于凭空造钱。
- `relatedType` 可为 `transfer`，此时收支表忽略它、余额却 `+amount`，又是一处口径漏洞（与 P0-2 同源）。

**建议修复**：删除原交易时提示"存在 N 笔退款，是否一并删除/解绑"；创建退款校验 `amount ≤ 原额 − 已退额`、账户一致、类型限定为 income/expense；孤儿退款在报表中显式标注。

**改动范围**：`transaction.service.ts`、`TransactionDetail.tsx`/`TransactionDrawer.tsx`，schema 若需改为 `Cascade` 则需迁移。

**验收标准**：超额退款被拒绝；删除原交易时退款有明确处理路径；不存在无原交易的"静默生效"退款。

---

### P1-7 投资快照：同日保存自引用、前链不同步、后端强校验与 UI 提示互相矛盾

**证据**

- 保存时"上一条快照"查询包含同日快照本身：`allocation.service.ts:66-79`（`date < 当日 23:59:59.999`），而同日 upsert 的 `existingSnapshot` 在 `:85-93` 才查出；同日更新时 `previousSnapshotId: previousSnapshot?.id`（`:115`）可能指向自己。
- 编辑路径反而排除了自身：`allocation.service.ts:316-323`（`id: { not: id }`）——两条路径语义不一致。
- 插入/修改早于后继的快照后，**不会更新后继的 `previousSnapshotId`**（只在删除时修链：`:217-230`）。
- 后端强制"市值总和 == 账户余额"：`:56-64`；但 UI 把非零差额正常展示为「差额（未分类）」：`InvestmentSnapshotModal.tsx:369`、`:490`，且保存按钮只校验 `accountBalance !== null && assetClasses.length > 0`（`:388`）。

**用户影响**

- 用户按 UI 提示填完（存在"未分类差额"是常态，比如现金部分没配资产类型），点保存却收到"市值总和与账户余额不一致"的错误，卡死在投资分析入口。
- 同日重复保存产生自引用链，XIRR/TWR（`investment-analysis-calc.ts:25-45`、`:322-385`）依赖快照链，结果失真或返回 null。
- 补录历史快照后，XIRR/TWR 使用错误的区间收益，年化收益率不可信。

**建议修复**

- 统一 `previousSnapshot` 查询条件（一律 `id: { not: 自身 }` 且严格 `< 当日 00:00`）。
- 新增/修改快照后，重算该账户快照链（或按日期重排 `previousSnapshotId`）。
- 二选一解决校验矛盾：要么后端允许差额并把差额落为「未分类」条目；要么前端将差额作为必填校验项并阻断保存（给出具体差额提示）。推荐前者，与 UI 现状一致。

**改动范围**：`allocation.service.ts`（`saveAllocationSnapshot` / `updateSnapshot`）、`InvestmentSnapshotModal.tsx`、`InvestmentSnapshotHistorySection.tsx`。

**验收标准**：可通过 UI 正常保存含未分类差额的快照；任意增删改后 `previousSnapshotId` 链无环且按日期严格递增；同日保存两次不产生自引用；为该账户计算的 XIRR 在链修复后稳定。

---

### P1-8 收入支出表「总额」含未分类交易，「分类明细」不含 → 报表自身对不上账；现金流量表的未分类桶不展示

**证据**

- 明细树只遍历分类表：`income-expense.service.ts:148-190`（`buildTree` 从 `childrenOf.get(null)` 出发）。
- 分类汇总却给未分类交易单独建桶：`:122-137`
  ```ts
  const catId = t.categoryId ?? 'uncategorized'
  ```
- 总额（`income.actual`）来自含未分类的全量求和：`:44-61`、`:272-274`。
- 前端只用明细树画饼图/树：`IncomeExpenseReport.tsx:167-185`、`:329-341`。
- 现金流：`cash-flow-aggregate.ts:127-133` 把无 `cashFlowType` 的归入 `uncategorized` 并计入合计，但前端只渲染经营/投资/筹资：`CashFlowReport.tsx:62-65`、`:395-398`。

**用户影响**：只要存在未分类交易（导入数据、快速记账都容易产生），**表头总额 ≠ 饼图/明细合计**，用户会怀疑软件算错；现金流量表同理，"合计"里有一部分钱在任何分类里都找不到。

**建议修复**：明细树增加"未分类"虚拟节点（`categoryId: null`），或让总额只统计已分类部分并在 UI 明示差额。现金流量表补一个可折叠的「未分类」活动分组。

**改动范围**：`income-expense.service.ts`、`CashFlowReport.tsx`、`cash-flow-aggregate.ts`、`shared/types`。

**验收标准**：存在未分类交易时，明细（含未分类节点）合计 == 表头总额；现金流量表三活动 + 未分类合计 == 总流入/流出。

---

### P1-9 首页口径与报表/交易统计不一致，且交易变更不刷新首页/报表

**证据**

- 首页只统计 `income/expense`，完全忽略退款：`analytics.service.ts:35`
  ```ts
  const txWhereBase = { type: { in: ['income', 'expense'] }, ... }
  ```
  趋势（`:92-103`）与分类占比（`:126`）同样忽略退款。
- 缓存失效范围过窄：`frontend/src/queries/transaction.ts:38-63` 只 `invalidateQueries(transactions)` 与 `accounts`，不动 `analytics`/`reports`/`budgets`。
- 全局 `staleTime: 30_000`、`refetchOnWindowFocus: false`：`frontend/src/main.tsx:19-21`。

**用户影响**：用户退款后，交易列表已冲减，首页"本月支出"却还是原值；记完账切回首页，看到的仍是旧数据（最长 30 秒后才可能刷新，且不聚焦刷新）。同一笔钱在不同页面数字不同，是"信任崩塌"级问题。

**建议修复**：首页改用与报表一致的净额口径（含退款抵扣）；在交易/账户/预算/导入等变更后统一失效 `analytics`、`reports`、`budgets`、`investments`（或引入按领域的 queryKey 上层键整体失效）。

**改动范围**：`analytics.service.ts`、`frontend/src/queries/*.ts`、`frontend/src/queries/keys.ts`。

**验收标准**：退款或记账后，无需手动刷新，首页/报表/预算数字同步更新；首页与收入支出表的本月收入/支出数值一致。

---

### P1-10 后端无鉴权、CORS 全开、监听全部网卡；破坏性接口裸奔

**证据**

- `backend/src/index.ts:22` `app.use(cors())`（`Access-Control-Allow-Origin: *`）
- `backend/src/index.ts:42` `app.listen(PORT, ...)`（未指定 host，绑定 `0.0.0.0`）
- 无需任何凭证即可清空数据：`backend/src/routes/data.route.ts:20`（`DELETE /all`）、`:25`（`DELETE /transactions`）

**用户影响**：作为一个"本地记账工具"目前风险可控；但只要运行在家庭共享网络、公司 Wi-Fi 或任何可路由网段，**任何设备都能一键清空全部账本**。这类"无认证 + 破坏性接口 + 全开 CORS"组合在 P0 定义里属于安全隐患，此处按"需暴露才触发"降为 P1；一旦产品计划多端/局域网访问，应立即升为 P0 并优先修复。

**建议修复**：`listen('127.0.0.1')` 默认仅本机；CORS 白名单化；破坏性接口加二次确认令牌或本地口令；若走向多端，则引入鉴权层。

**改动范围**：`index.ts`、`data.route.ts`、部署脚本/文档。

**验收标准**：非本机来源无法访问 API；清空类接口需要显式确认参数。

---

## 3. P2 体验 / 信息架构 / 一致性

### P2-1 所有页面都没有查询错误态，失败时会伪装成"0 / 空"

**证据**：前端查询普遍只解构 `isLoading`，全仓库无 `isError` 使用。示例：`Dashboard.tsx:54-68`、`Reports.tsx:212-239`、`Transactions.tsx:125`。财务页面里，`?? 0` 兜底（如 `Dashboard.tsx:80-85`）会把"请求失败"渲染成"本月收入 0 元"。

**影响**：后端宕机或接口报错时，用户看到的是**一份看起来正常的、全为零的财务报表**，比显示错误危险得多。

**建议**：统一封装查询态组件（`Loading / Error / Empty / Content`），错误态给出重试按钮；禁止直接对关键金额使用 `?? 0` 而不区分错误。

**改动范围**：`frontend/src/components/common/`（新增 `QueryState`），各页面接入；query hooks 保持默认 `retry: 1`。

**验收标准**：断开后端后任意页面显示错误与"重试"，不显示零值报表。

---

### P2-2 预算"查看交易"丢失周期与账户条件

**证据**：`frontend/src/pages/Budgets.tsx:302-304`
```ts
navigate(`/transactions?categoryId=${selectedBudget.categoryId}`)
```
按钮定义：`frontend/src/components/budgets/BudgetDetail.tsx:64-72`。

**影响**：用户从预算点进去看到的是一份**宽松得多**的交易列表（跨账户、跨时间），无法核对"这个月这笔预算是怎么用超的"，下钻结论不可信。

**建议**：跳转时带上账户、当前周期 `start/end`、分类三者；筛选器需支持 URL 预填（TransactionFilter 已具备 URL 同步能力）。

**验收标准**：从预算下钻后的列表条数与合计 == 预算用量数字。

---

### P2-3 冷启动无引导，空数据时界面无法自解释

**证据**：`App.tsx:16-23` 仅 5 个路由；`Dashboard.tsx` 无"记一笔"入口（对比 `Transactions.tsx:257-259` 有），空态仅有 `Empty description="暂无数据"`（`:266`、`:303`）。没有"先创建账户 → 再记一笔 → 看报表"的引导。

**影响**：首次使用者面对全 0 的首页不知道下一步做什么；账户/分类/资产类型这些前置配置分散在设置页深处，容易卡在"能记但看不到"。

**建议**：首页在"无账户/无交易"时展示引导清单（创建账户 → 记第一笔 → 查看报表），并提供"记一笔"快捷按钮；设置页给出配置完成度提示。

**验收标准**：全新数据库下，用户不查文档也能在 3 步内完成"建账户 → 记账 → 看到非零净资产"。

---

### P2-4 备份/恢复能力不足以支撑"数据安全"承诺

**证据**：`DataBackupSection.tsx` 只有"选择文件 + 合并/覆盖 + 导入"（`:230-272`）；无自动备份、无导入前自动导出、无历史恢复点、无导入预检（文件格式/版本/影响范围）。导出还丢字段（见 P1-3）。

**影响**：误操作覆盖后**没有任何回退路径**；用户不敢用"覆盖"；备份文件本身信息不完整，不足以还原真实账本。

**建议**：导入前自动导出一次"回滚点"；覆盖模式提供 diff 预览（将删除/新增多少条）；补充自动定时备份；导出增加 manifest 版本号。

**验收标准**：覆盖导入失败或用户反悔时，可一键回到导入前状态。

---

### P2-5 信息架构：设置页承载过多且入口分散

**证据**：5 个顶级导航（`MainLayout.tsx:16-22`）中，账户、账户分类、收支分类、现金流量类别、投资资产类型、主题、数据备份全部塞在 `/settings` 单页内（`Settings.tsx` 多段卡片），而报表页又内嵌了分类配置弹窗（`Reports.tsx:203-206`：`accountCategoryModalVisible`、`transactionCategoryModalVisible`、`cashFlowConfigModalVisible`、`investmentConfigModalVisible`）。

**影响**：同一份配置可在两处修改，用户不确定"应该去哪改"；设置页冗长，移动端需长时间滚动。

**建议**：设置页按"账户 / 分类 / 投资 / 数据 / 外观"分组为可导航的子区块（锚点或子路由），报表页只保留"跳到设置"链接。

**验收标准**：同类配置有唯一权威入口；报表页不再重复配置入口。

---

### P2-6 移动端一致性（`docs/todo.md` 遗留项）

**证据**：`docs/todo.md:6` "时间筛选器手机和 pc 不一致"、`:12` "不同页面的头部缩进间隔不一致" 仍为未完成。实现上报表用共享 `TimePickerField`（`components/common/TimePickerField.tsx`），交易筛选用 `RangeTimePickerField`，两者移动端交互由不同组件分支实现（`TimePickerMobile.tsx`）。

**影响**：同一"选时间"的操作在不同页面手感与布局不同，移动端体验割裂。

**建议**：统一移动端时间选择交互（底部抽屉 + 预设 chip）；统一 `PageHeader` 的间距令牌（目前散落在 `styles/pageShell.css` 与各页面内联样式中）。

**验收标准**：所有时间筛选入口在移动端使用同一交互与间距规范。

---

## 4. P3 视觉 / 效率 / 低风险改进

| ID | 问题 | 证据 | 建议 |
|---|---|---|---|
| P3-1 | 常用记账路径冗余：手续费/优惠券两个字段常驻表单，且无"最近使用的账户/分类"默认值 | `TransactionForm.tsx:329-359` | 费用字段折叠为"更多"；记住上次账户/分类（本地存储） |
| P3-2 | 交易列表无备注/金额关键字搜索，无批量操作 | `TransactionFilter.tsx`（无关键字输入）；`TransactionTable.tsx`（无 `rowSelection`）；`docs/todo.md:3` | 增加关键字搜索；实现批量改分类/删除 |
| P3-3 | 预算使用率被截断在 100%，超支严重程度无法体现 | `budget.service.ts:269` `Math.min(..., 100)` | 保留真实百分比并在 UI 区分超支档位 |
| P3-4 | 4 个报表 tab 各自独立时间范围，切换 tab 口径悄然变化，且无"当前口径"说明 | `Reports.tsx:129-192` | 提供"全局时间范围"开关 + 每张报表标注口径（明细/预算/预测） |
| P3-5 | 死参数/重复实现：`calculateBalanceChangeDecimal` 与 `calculateTransferInAmountDecimal` 的 `_fee/_coupon` 已失效；两处转账金额逻辑各写一遍 | `balance.service.ts:7-37`、`cash-flow-aggregate.ts:5-18` | 清理无效参数，抽取唯一的 `applyTransactionToBalance` 纯函数 |
| P3-6 | 桑基图条数无上限（`docs/todo.md:10`）；表格不易复制（`docs/todo.md:9`） | `CashFlowReport.tsx:380`、`:489` | 桑基图取 Top N + 其他；表格增加复制/导出为 CSV |

补充说明：**设计令牌与视觉一致性整体良好**。全前端仅 1 处硬编码色值（`charts/BaseChart.tsx:22` 的 fallback `#1890ff`），其余均走 `theme.useToken()` / CSS 变量；字体、间距、圆角基本收敛在 `styles/theme/`。这一块不建议大动。

---

## 5. 已核查、未发现问题的部分（避免重复投入）

- **金额精度**：全链路使用 `Decimal`（`@prisma/client/runtime/library`）+ `toDecimal` 归一，未发现浮点累加问题。
- **余额计算性能**：`calculateBalancesBatch` 单次查库 + 内存缓存，并复用调用方已查的账户列表（`balance.service.ts:185-253`），设计合理。
- **类型契约**：前后端共享 `shared/types/index.ts`，前端 `api.ts` 直接 re-export，无重复定义（`services/api.ts:1-48`）。
- **筛选状态持久化**：报表/交易筛选已做 URL + localStorage 持久化（`Reports.tsx:138-182`，`todo.md:8` 已完成项）。
- **删除账户的级联处理**：`account.service.ts:133-217` 会统计并显式清理交易/预算/快照，再删除账户，逻辑完整（与 P1-4 的 config 覆盖路径形成对比，那里缺了这一步）。
- **无 TODO/FIXME/mock 残留**：全仓库未发现占位实现或假数据分支。

---

## 6. 建议的修复路线图

**第 1 阶段（金额语义收口，P0 全清）**
1. 定义并落地唯一金额语义层：`refund` 按 `relatedType` 定符号；转账拆分本金/手续费；日期边界统一（半开区间 + 本地日历日归一）。
2. 让余额、收支表、现金流量表、预算、投资分析**全部调用同一批纯函数**，删除各自的口径实现。
3. 补齐单测：`refund(income|expense)`、`transfer(±fee/coupon)`、`initialBalanceDate = D / D±1`。
> 出口条件：`资产变动 == 收入 − 支出` 在任意组合数据下成立。

**第 2 阶段（数据安全，P1-3 / P1-4 / P1-10）**
4. 导入去重 + 真正的覆盖模式 + 遵守 `includes`；导出补全字段并改 ISO 时间。
5. 破坏性操作统一二次确认 + 自动回滚点；修掉"仅配置覆盖"的外键陷阱。
6. 默认只监听 `127.0.0.1`，CORS 白名单化。

**第 3 阶段（一致性与完整性，P1-1/2/5/6/7/8/9）**
7. 预算周期末日 + 账户维度 + 退款抵扣。
8. 退款创建/编辑换算闭环；退款与原交易完整性校验。
9. 投资快照链重算 + 校验口径与 UI 对齐。
10. 报表未分类可见化；首页口径对齐报表；统一缓存失效策略。

**第 4 阶段（体验，P2 + P3）**
11. 查询错误态组件、新手引导、备份能力、设置页 IA、移动端时间选择统一。
12. 效率与视觉改进（折叠费用字段、关键字搜索、批量操作、桑基图 Top N、表格复制）。

---

## 7. 工程结构评估（第 13 项）

### 7.1 总体判断

**结构是合理的，问题不在“没有分层”，而在“边界不一致”和“少量无意义抽象”。** 以当前体量（后端约 8.4k 行 TS、前端约 15.6k 行 TS/TSX/CSS）来看，`routes → services → prisma` 的分层、`queries → services/api → 后端` 的数据流、`shared/types` 的契约复用都成立，不需要也不建议做 FSD/六边形之类的整体重写。

真正的结构性问题有两类：

1. **核心领域的“金额与期间”语义没有唯一实现**（已在 P0-2/P0-3/P1-1 体现），属于抽象不足——这是最该修的。
2. **少量抽象是为拆而拆**，不但没带来复用，反而掩盖了 bug（`calculateTransferInAmountDecimal` 最典型）。

### 7.2 过度抽象 / 无意义抽象（应删或合并）

| 位置 | 现状 | 问题 | 建议 |
|---|---|---|---|
| `balance.service.ts:30-37` | `calculateTransferInAmountDecimal(amount, _fee, _coupon)` 直接 `return amount`，两个参数从未使用 | 抽象外壳保留了“手续费已处理”的假象，实际是 P0-3 的藏身处；ESLint 的 `argsIgnorePattern: '^_'` 让 `_fee` 永远不会报警 | 删除该函数，转入金额直接用 `amount`，手续费在调用方显式处理；同时删除 `calculateBalanceChangeDecimal` 的 `_fee/_coupon` |
| `InvestmentSnapshotHistorySection.tsx:144-167` + `InvestmentSnapshotHistoryModal.tsx` | Section 已经渲染完整 `SnapshotTimeline`，又提供“查看更多”打开一个渲染同样内容的 Modal | 50 行组件 + 一个 Modal 状态只为重复展示同一列表；用户点“查看更多”看到的和上面一模一样 | 二选一：要么 Section 只显示前 N 条、Modal 显示全部；要么删除 Modal |
| `components/settings/shared.tsx` | 3 行 `export *`，把 `treeTypes/sortable/moveModalHelpers` 透出；且文件是 `.tsx` 但无 JSX | 多余的一层桶导出，还把 hooks 泄漏进组件公共 API；ESLint 已报 3 条 `react-refresh/only-export-components` 警告 | 删除 `shared.tsx`，需要什么直接 import；`sortable` 改名并移到 `hooks/` 或 `settings/sortable/` |
| `components/charts/BarChart.tsx` / `LineChart.tsx` | 各 11-12 行，仅给 `BaseChart` 传 `chartType` | 收益很小，但成本也低，属于“可接受的小包装” | 保留即可；若后续再加图表类型，合并为一个 `<Chart type>` |
| `common/tree.ts` | 3 行转发 `shared/utils/tree` | 纯转发 | 保留（为后端提供稳定入口，避免到处写 `../../../shared`） |

### 7.3 抽象不足 / 耦合（应抽但没抽）

| 位置 | 现状 | 后果 | 建议 |
|---|---|---|---|
| 金额语义 | `refund` 符号在 `balance.service`、`income-expense.service`、`cash-flow-aggregate`、`transaction.service` 各写一遍；转账手续费在 `utils/transaction.ts`、`balance.service`、`cash-flow-aggregate`、`investment-analysis-collect` 各写一遍 | 同一笔钱 5 种算法（P0-2/P0-3） | 新增 `backend/src/domain/transaction-effect.ts`：输入交易，输出 `{ balanceDelta, incomeDelta, expenseDelta, cashIn, cashOut }`，所有报表/预算只消费它 |
| 期间解析 | `report.utils.ts:37-83` 的 `resolveReportPeriod` 与 `budget.service.ts:84-129` 的 `getPeriodRange` 是两套实现；预算还绕过了 `common/date.ts:12` 的 `dayEnd`，手工 `new Date(y, m+1, 0)` | P1-1 的直接根因；`common/date.ts` 的注释明确说“避免绕过 dayStart 引起时区偏差”，预算恰好绕过了 | 只保留 `resolveReportPeriod`（或抽 `domain/period.ts`），预算复用它；删除 `getPeriodRange` |
| 报表 → 预算 | `report.utils.ts:1` 与 `balance-sheet.service.ts:13` 从 `budget.service` 导入 `generatePredictions` | 报表层反向依赖预算领域；想复用预测就得连预算 CRUD 一起加载；测试需要 mock 预算 | 抽 `services/forecast/`（或 `domain/prediction.ts`），预算与报表都依赖它 |
| 路由层 | `transaction.route.ts` 256 行，包含类型校验、字段映射、按类型 dispatch（`:208-256`）；而 `analytics.route.ts` 26 行、`report.route.ts` 24 行几乎只做转发 | 同一项目里“路由该多厚”没有统一标准；交易的新类型会继续膨胀路由 | 路由只做 HTTP 校验与调用；type dispatch 下沉到 `transaction.service.create(req)` |
| `report.utils.ts` | 301 行、15 个导出：期间解析 + 预测累加 + 资产负债求和 + 现金流标记 + 月份生成 | 万能工具箱，任何报表改动都可能触碰它；职责无法从文件名推断 | 拆为 `period.ts` / `prediction.ts` / `account-sum.ts` / `cash-flag.ts` |
| 前端查询层 | 8 个 query 文件里 21 处 `.then((res) => res.data.data ?? [])`；错误/空态各页面各写 | 重复且容易漏（P2-1 就是这么漏掉 `isError` 的） | 提供 `unwrap<T>(res)` 与 `<QueryState>`；hooks 统一 `select` 或封装 `apiQuery` |
| 前端巨型组件 | `TimePickerMobile.tsx` 866 行、`InvestmentSnapshotModal.tsx` 472、`InvestmentAssetClassConfigModal.tsx` 458、`AccountConfigModal.tsx` 308（内含分类 CRUD + 账户 CRUD + 拖拽排序 + 移动弹窗四类职责）、`Budgets.tsx` 402 | 单文件认知负担高；`AccountConfigModal` 任何一个功能改动都要回归全部四个功能 | 按“列表 / 表单 / 排序 / 移动”拆子组件；TimePicker 按“预设 / 日历 / 数值滚轮”拆 |
| API 契约类型 | 19 处 `ApiResponse<{ ... }>` 内联在 `api.ts`；`TransactionStats` 只在后端定义（`transaction.service.ts:124`）；`ImportFullResult` 前后端各一份（`api.ts:166` vs `import/shared.ts:279`） | 契约漂移无人发现（如 `includes` 前端没传，类型上却“看起来支持”） | 全部收敛到 `shared/types/index.ts`，前端只做 re-export |

### 7.4 目录结构的一致性

| 观察 | 证据 | 评价 |
|---|---|---|
| `services/` 根目录 12 个扁平文件 + `report/`、`import/`、`export/`、`investment/` 4 个子目录，划分标准不明确 | `backup.service.ts`、`clear-data.service.ts` 在根目录，却被 `import/`、`export/` 依赖 | 建议按“领域”而非“文件大小”划分：`backup/`（archive + detect + clear）、`report/`、`investment/`，根目录只留 account/transaction/budget 三个核心 |
| 4 张报表的拆分粒度不同 | cash-flow 拆 5 个文件共 832 行（service 120 + collect 81 + aggregate 182 + build 371 + types 78）；income-expense 单文件 248 行；balance-sheet 单文件 140 行 | cash-flow 的拆分本身是合理的（collect→aggregate→build 管线清晰），问题只是其他报表没跟进；不必强行统一，但应在文档里说明“复杂报表才拆” |
| 前端没有 `features/` 层，页面直接组合 queries + components | `pages/Budgets.tsx` 402 行承载增删改查、状态轮询、跳转 | 当前规模可接受；不建议上 FSD，但页面里的表单提交/删除逻辑应下沉到 hooks（`useBudgetActions`） |
| 文档与结构漂移 | `docs/dev-guide.md:45` 写 `src/constants/transactionType.ts`，实际是 `src/utils/transactionType.ts`；`:49-53` 写 `styles/base|layout|pages/`，实际是扁平 `styles/` + `styles/components/`；`:54` 写 `utils/color.ts`，实际是 `colorPalette.ts` | 新成员会按文档找错目录；建议随本次重构一并更新，或在 CI 里加结构校验 |

### 7.5 结构治理建议（避免大爆炸重构）

1. **先抽语义，不动目录**：新增 `domain/transaction-effect.ts` + `domain/period.ts`，把 P0/P1 的口径统一掉。此时目录几乎不变，但最危险的耦合已解除。
2. **再抽预测**：`generatePredictions` 从 `budget.service` 移到 `forecast/`，报表与预算改为依赖新模块。
3. **最后收口前端**：`QueryState` + `unwrap` + 拆 3 个超大组件。这一步纯机械，风险低，可以按页面逐个做。
4. **不要做**：为了“看起来整齐”把 12 个 service 全部改成 class、引入 DI 容器、或重写为 FSD。以当前团队规模和代码量，这些都会是负收益。

---

## 8. 命名与代码风格一致性（第 14 项）

### 8.1 总体判断

**机械层面的风格一致性很好，概念层面的命名一致性不足。**

可量化的事实：

- 全仓库 **0 个行尾分号**、**0 处双引号 import**（前端 621 处、后端 239 处全部单引号）；
- 后端文件 100% kebab-case，前端组件 60/67 个文件 `export default`，63 个使用 `React.FC`；
- CSS 类名统一 BEM-like（`.app-shell__brand`、`.mobile-tab-bar__item--active`）；
- `npm run lint`：后端 0 error 0 warning，前端 0 error 10 warning（均为 hooks 依赖/桶导出类结构警告）。

所以第 14 项的答案不是“风格乱”，而是“**同一概念有多个名字/多个定义**”。

### 8.2 具体不一致清单

| # | 问题 | 证据 | 影响 | 级别 |
|---|---|---|---|---|
| N1 | `TransactionType` 有 4 个定义 | `shared/types/index.ts:82`、`backend/src/services/balance.service.ts:5`、`backend/src/routes/transaction.route.ts:34`、`frontend/src/utils/transactionType.ts:22`（由配置对象反推） | 新增一种交易类型时，编译器不会提醒你改另外 3 处；这正是退款/转账语义分叉的温床 | P2 |
| N2 | 类型“单一来源”被破坏 | `ImportFullResult` 前后端各一份（`api.ts:166` / `import/shared.ts:279`）；`TransactionStats` 只在后端（`transaction.service.ts:124`），前端在 `api.ts:122` 内联；19 处 `ApiResponse<{...}>` 内联 | 契约变更靠人肉同步；`includes` 参数缺失这类问题类型系统完全看不见 | P2 |
| N3 | 同一个类型有两条 import 路径 | 22 个文件 `from '.../services/api'`，13 个文件 `from '@shared/types'`；`api.ts` 同时是 HTTP 客户端和类型桶 | 读代码时无法判断“类型的权威定义在哪”；容易出现一边改了另一边没改 | P3 |
| N4 | `@/` 别名配置了但从未使用 | `frontend/vite.config.ts:9` + `frontend/tsconfig.json` 的 `paths["@/*"]`；实际 `from '@/` 使用次数 = 0，深层相对路径 135 处 | 死配置；深层 `../../../../` 易错且重构困难 | P3 |
| N5 | 组件目录里有 3 个非 PascalCase 文件 | `components/settings/sortable.tsx`（hooks + render helpers）、`moveModalHelpers.tsx`、`shared.tsx` | 违反 `docs/dev-guide.md:97` 的 `PascalCase.tsx` 约定；`sortable.tsx` 实际不是组件，命名误导 | P3 |
| N6 | 同一文件内函数声明风格混用 | `transaction.service.ts` 中 20+ 个 `export async function`，唯独 `:361` 是 `export const buildTransactionListWhere = async (...)`；同文件 `:299/:327` 又用 `const x = async () =>` | 无功能影响，但破坏可预测性；grep/重构时容易漏 | P3 |
| N7 | 前后端质量门禁不对等 | `frontend/tsconfig.json` 有 `noUnusedLocals`/`noUnusedParameters`；`backend/tsconfig.json` 没有；后端 ESLint 用 `argsIgnorePattern: '^_'` 放行未使用参数 | 后端可以积累死参数（`_fee/_coupon` 就是因此长期存在）；前端更严格，标准应统一 | P3 |
| N8 | 同一字段三套命名 | 表单/前端用 `fromAccountId`（`TransactionForm.tsx:173`），API/DB 用 `accountId`（`utils/transaction.ts:116`），CSV 用 `账户1/账户2`；预算却直接用 `accountId`（`BudgetForm.tsx:66`） | 映射只存在于 `formatTransactionSubmitValues` 一处，新增入口（如导入、批量编辑）极易漏映射 | P3 |
| N9 | 回调/属性命名不统一 | `onOk` 8 处、`onConfirm` 2 处、`onClose` 8 处、`onCancel` 37 处；自定义组件统一用 `visible`，内部再转 antd 的 `open` | 语义上 `onOk`（提交表单）与 `onConfirm`（破坏性确认）确有区别，可接受；但应在规范里写清，否则新人会随机选 | P3 |
| N10 | 命名粒度/文案不统一 | “未分类”（报表）、“未知账户”（现金流）、`'未分类'` 兜底与 `categoryId: null` 混用；错误文案“交易记录”/“原交易记录”/“账户”粒度不一 | 用户可见文案不一致；逻辑上“无分类”与“分类名为未分类”也可能被混淆 | P3 |

补充：`docs/dev-guide.md` 的目录描述与实现漂移（见 7.4），本身也是“命名/结构一致性”问题的一部分。

### 8.3 最低成本的统一动作（建议按序）

1. **类型收口（半天）**：`shared/types/index.ts` 增加 `TransactionStats`、`DashboardSummary`、`ImportFullResult`；后端 `balance.service`/`transaction.route` 改为 `import type { TransactionType } from '@shared/types'`；前端删除 `utils/transactionType.ts` 里的类型再导出，改为 `type TransactionType = keyof typeof TRANSACTION_TYPE_CONFIG` 仅在配置处使用，或直接从 shared 引入。
2. **import 收口（1 小时）**：统一 `@shared/types`；要么全面启用 `@/`，要么删掉别名配置（建议前者，逐步替换，不强制一次改完）。
3. **文件改名（10 分钟）**：`sortable.tsx` → `useSortableTable.tsx`（或移到 `hooks/`），`moveModalHelpers.tsx` → `useMoveModal.tsx`，删除 `shared.tsx`。
4. **门禁对齐（30 分钟）**：后端 tsconfig 打开 `noUnusedLocals`/`noUnusedParameters`，清理 `_fee/_coupon`；把 `export const x = async` 统一成 `export async function`。
5. **规范补全（30 分钟）**：在 `dev-guide.md` 增加“字段命名映射表（form ↔ API ↔ CSV）”“回调命名约定”“API 契约类型必须放 shared”三条，并修正已漂移的目录说明。

### 8.4 验收标准

- `grep -r "type TransactionType"` 只剩 `shared/types/index.ts` 一处；
- `grep -r "ImportFullResult" backend frontend` 只在 shared 定义 + 引用；
- `grep -r "from '@/" frontend/src` 数量 > 0，或 `@/` 别名从配置中移除；
- `components/**` 下不再有 camelCase/lowercase 的 `.tsx`（hooks 目录除外）；
- 前后端 `npm run lint && npm run typecheck` 均 0 warning。

---

## 附录 A：验证说明

- 所有 P0/P1 结论均来自源码直读，可复现：给出文件与行号，读者可自行核对。
- 标注「待运行时复核」的两项（SQLite 外键在 config 覆盖路径的实际报错形态、CSV 重复导入的落库结果）依赖运行时行为，建议在修前用一份脱敏导出跑一次做基线，修后用同一份数据回归。
- 本次审计**未修改任何代码**，`git status` 干净，基线 commit `39b3ba2`。
