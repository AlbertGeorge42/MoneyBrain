# 阶段 0 · 地基（M0–M1）

> **目标**：把「记账这件事本身」做对——口径可信、数据不丢、结构不烂。
> 这一阶段不做同步、不做移动端、不做新功能，只做**让后面的功能有地基可站**的事。
>
> 界面与体验的重构在 [stage-1](stage-1-experience.md)：本阶段先把数据与结构收干净，
> 避免在流沙上改界面。
>
> 阶段文档只写**还没做到的事**。已完成部分的现状见 [architecture.md](../architecture.md)。

## 本阶段要解决的问题

| # | 问题 | 归属 |
|---|---|---|
| 2 | 四张报表各自记时间范围，数字对不上 | C1–C3 |
| 3 | 投资分析自成一套口径，同一笔钱两个答案 | A0 |
| 4 | service 直接写 Prisma 查询，换端就得重写 | D1–D9 |

## 目标架构

目标架构的**唯一来源**是[目标架构](architecture.md)（§1–9）。
本文件不再复制全文——复制必然漂移，动手前读对应小节即可。
（当前已实现的现状见 [../architecture.md](../architecture.md)，注意区分。）

本阶段**额外收窄**的约束（本阶段落地或需要在本阶段强调的部分）：

- **规则层两层拆分**（[目标架构 §1](architecture.md)）：口径规则（纯数据/纯函数）
  与聚合计算分离，规则层同时被领域纯函数与后端 SQL `where` 消费。
  本阶段要把报表与预算里绕过内核的 SQL 汇总收编到这条路径上——同一口径不允许出现两个答案。
- **repository 边界**（批次 D1）：引入 `apps/api/src/db/repositories`；软删除过滤
  （`deleted_at IS NULL`）与将来的账本过滤**只**在 repository 层做，service 层不出现 `prisma.`。
- **K 批次的表不在本阶段建**：多账本、标签、周期规则、储蓄目标、票据随功能一起落地（阶段 4）；
  但同步契约必须与实体集合解耦（[stage-2](stage-2-sync.md) 批次 F11），
  否则这些表落地时会推翻容器格式。
- **数据模型与运行基线**：软删除、审计事件、快照链、可同步字段（`rev`/`vv`）见
  [目标架构 §4](architecture.md)；SQLite WAL / busy_timeout / 写串行化 / `db:verify`
  数据自检见 [目标架构 §9](architecture.md)。
- **属性测试**（批次 A3）：用 `fast-check` 随机生成交易序列，
  断言[蓝图入口 §4](../rewrite-blueprint.md) 的 1–6 条内核不变量。
  领域层是纯函数，属性测试成本极低、收益极高。

## 差距清单

**推荐执行顺序**：B（安全网）→ A（口径内核）→ C（一致性）→ D（结构收口，M1）。

- 安全网先于一切结构性改动（决策 #21：备份可恢复 + 迁移有历史之后，重写存储才是可逆的）。
- C 依赖 A 的领域层规则同源（C2 的「同源」就是 A0 落地的规则层）。
- D 放最后，避免结构改造掩盖正确性问题（决策 #20）。

### 批次 A · 口径与内核（正确性地基）

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| A4 | 收入/支出/退款的 `amount` 存净额，`fee/coupon` 冗余；转账存本金。**已评估，推迟** | 统一「本金 + 手续费」：所有类型 `amount` 都是本金，手续费独立记账，净额由服务端算 | `fee` 不再是派生字段；「我付了多少手续费」可查；表单只送本金/手续费/优惠券，**前端不再计算任何写库金额** |

**A4 为什么推迟**：核对数据后否掉了。

- 收入 `amount` 本来就是净额（本金 − fee + coupon），现有数据的收入行 `fee/coupon` 全是 0，拆开不产生任何新信息。
- 退款行没有本金/手续费拆分，只有 `relatedTransactionId` + `relatedType`；要存本金就得新增字段并回填历史。
- `remainingRefundable` 以 `amount` 为可退上限。改 `amount` 的含义会连带改变可退金额，属于账务语义变更，不是单位换算。
- 触发条件：出现「手续费需要单独统计或单独分类」的真实需求，或前端仍在计算写库金额。在那之前，A4 保持现状。

后续不得倒退的硬约束：

- **分是唯一权威单位**：每多一层单位，就多一类「把 1234 分当 1234 元」的错。
  传输也用分之后，前端不需要任何换算，也就没有换算错的可能。
- **字段名不加单位后缀**（`amount` 而不是 `amountMinor`）：单位由类型 `Minor`（branded number）保证——
  写错编译不过；后缀靠人记，漏写没人拦。反过来，**人类读的边界必须显式写单位**：
  CSV 表头、备份 manifest、UI 标签、错误信息。
- **元只出现在两个边界**：用户输入框、文件（CSV / 备份）。输入用字符串按小数位解析，
  不要 `Number(x) * 100`（`8.115 * 100 = 811.4999…`）。

### 批次 D · 结构、边界与规模（防债）

| # | 现状 | 目标 | 验收 |
|---|---|---|---|
| D4 | 页面直接组合 queries + 巨型组件 | feature 切片 + 页面瘦身 + `ui/` 原语层 | 页面文件 < 200 行；跨 feature 只走公开入口 |
| D10 | D1 按基线只收了 19 个 service 文件，基线外残留绕过 repository：clear-data（15 处 `tx.<model>.` 直调 + 2 处 `prisma.$transaction`）、import/config-import（24 处 `tx.`）、import/budget-import（7 处 `tx.`）、smart-import（2 处 `prisma.$transaction`）、audit-event 与 rollback service（4 处 `prisma.$transaction`） | 残留收进 repository 或统一事务封装（`db/transaction.ts` 的 `withTransaction`，service 不再直接调 `prisma.$transaction`），使「数据库访问只在 repository 层」对**全量代码**成立。例外判定口径（同步进 dev-guide §8）：`$queryRaw` 仅允许查迁移元数据（`_prisma_migrations`），不得查业务表；迁移/种子脚本与 `common/db.ts` 公共查询工具为白名单 | grep 全量验证：① `rg "tx\.(account\|accountCategory\|transactionCategory\|budget\|investmentAssetClass\|investmentAllocationSnapshot\|investmentAllocationItem)\." apps/api/src` → 0 命中；② `rg "prisma\.\$transaction" apps/api/src/services` → 0 命中（批量事务封装在 `db/repositories/` 与 `db/transaction.ts` 内属合法）；③ D1 既有验收 grep 对 `apps/api/src/services` 保持 0 命中 |

## 出口条件

- 覆盖导入可一键回到导入前；删除可撤销且有修改历史。
- 四张报表共享同一期间；预算下钻与用量同源；超支显示真实百分比。
- 投资分析不再有第二份现金流口径；属性测试覆盖内核不变量 1–6。
- service 层无 Prisma 调用；列表与报表查询量随期间收敛（余额除外）；并发写不报锁冲突。

## 本阶段不做

体验与界面改造（批次 E、U）属于 [stage-1](stage-1-experience.md)；
多账本、周期交易、标签属于 [stage-4](stage-4-expansion.md)；
同步、移动端见蓝图入口的阶段总览。
