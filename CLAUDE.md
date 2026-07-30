# MoneyBrain Claude Code 指南

本文件供 Claude Code 使用。项目通用信息（结构、命令、技术栈）见 [AGENTS.md](AGENTS.md)。

## Claude 专用用法

```bash
# 运行单个测试
cd backend  && npx vitest run path/to/test.ts
cd frontend && npx vitest run path/to/test.ts
npx vitest run -t "test name"

# 覆盖率
cd frontend && npm run test:coverage
cd backend  && npm run test:coverage
```

## 关键要点

- **API 响应**: 统一 `ApiResponse<T>`（success/data/error/timestamp）
- **交易类型**: `income | expense | transfer | refund | adjustment`
- **预算类型**: `income | expense | transfer`，周期 `daily | weekly | monthly | quarterly | yearly`
- **分类**: 层级结构（parentId/children）
- **状态**: 无 Zustand — React Query + hooks
- **主题**: Ant Design ConfigProvider + CSS 变量（`var(--mb-*)`），`useTheme()` hook
