# MoneyBrain 测试

## 1. 层级

| 层级 | 工具 | 目录 | 说明 |
|---|---|---|---|
| 领域 | Node Test Runner + tsx | `packages/domain/tests/` | 金额、日期、分录、汇总 |
| 后端单元 | Vitest | `apps/api/tests/unit/` | service 纯逻辑、Mock Prisma |
| 后端集成 | Vitest + Supertest | `apps/api/tests/integration/` | 路由 + 测试 SQLite |
| 前端单元 | Vitest + Testing Library | `apps/web/tests/unit/` | 组件/页面 |
| 端到端 | Playwright | `e2e/tests/` | 主旅程与响应式 |

## 2. 命令

```bash
npm run test:domain                    # 领域测试
npm run test:api                       # 后端全部
npm run test:web                       # 前端
npm run test:e2e                       # E2E（自动启动服务）

# 只跑后端某一层
npm run test:unit -w @moneybrain/api
npm run test:integration -w @moneybrain/api
# 集成测试会先自动创建/同步 apps/api/prisma/test.db
```

## 3. 当前规模

- 领域：18 个用例（金额、期间、五类交易、退款、预算、期初边界）。
- 后端：19 个测试文件，224 个用例。
- 前端：6 个测试文件，65 个用例，见 `apps/web/tests/unit/`。
- E2E：6 个 spec（onboarding、theme、responsive ×2、settings、example）。

## 4. Mock 策略

| 层级 | 数据来源 |
|---|---|
| 领域 | 纯内存对象，无 mock |
| 后端单元 | `createMockPrisma()`（`apps/api/tests/mocks/prisma.ts`） |
| 后端集成 | `apps/api/prisma/test.db`（测试前由 `tests/global-setup.ts` 自动 `db push`） |
| 前端 | `apps/web/tests/setup.ts` 统一 mock AntD/ECharts/ResizeObserver |
| E2E | 开发数据库；`clearAllTestData()` 清理。**运行前先备份 `apps/api/prisma/dev.db`，E2E 会清空全部数据。** |

## 5. 回归清单

- [x] 期初日期当天交易计入。
- [x] 收入退款减少余额、支出退款增加余额。
- [x] 转账手续费不贷记到目标账户。
- [x] 预算最后一天（半开区间）。
- [x] 退款金额超过可退余额时拒绝。
- [x] 同一 CSV 重复导入不产生重复交易（`importKey`）。
- [x] 报表合计与分类明细一致（含未分类）。
- [ ] 导入中断后的回滚点。
- [ ] 投资快照前链重算。

## 6. 验证顺序

`domain → lint → typecheck → test`。CI 未配置前，本地提交前至少跑：

```bash
npm run test:domain
npm run typecheck:api
npm run test:api
npm run typecheck:web
npm run test:web
```
