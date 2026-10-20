# MoneyBrain Claude Code 指南

通用信息见 [AGENTS.md](AGENTS.md)。本文件只列容易踩错的点。

## 运行单个测试

```bash
cd apps/api  && npx vitest run path/to/test.ts
cd apps/web  && npx vitest run path/to/test.ts
cd apps/api  && npx vitest run -t "test name"
node --import tsx --test packages/domain/tests/ledger.test.ts
```

## 关键约束

- **算钱只走 `packages/domain`**：`postingsOf`、`summarizeFlows`、`budgetUsage`。
- **交易类型**：`income | expense | transfer | refund | adjustment`。
- **金额语义**：收入/支出/退款是净现金流；转账 `amount` 是本金，手续费单独存。
- **期初余额**：期初日期当天开始前；当天交易计入。
- **日期**：`LocalDate` + 半开区间；业务代码禁止 `23:59:59.999`。
- **API**：统一 `ApiResponse<T>`（success/data/error/timestamp）。
- **状态**：React Query + 本地 hooks，无 Zustand。
- **主题**：AntD ConfigProvider + CSS 变量（`var(--mb-*)`）。
- **导入**：`Transaction.importKey` 保证同一 CSV 重复导入幂等。
- **不要**新增 `React.FC`、桶导出、按交易类型复制金额逻辑。
