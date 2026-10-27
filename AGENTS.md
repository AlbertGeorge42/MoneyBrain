# AGENTS.md — AI 会话开发约定

MoneyBrain 采用「单人 + AI 会话」方式开发。本文件是每次会话的入口；对人类协作者同样适用。

## 文档读法（按序）

1. 本文件 —— 工作方式
2. [docs/dev-guide.md](docs/dev-guide.md) —— 可执行规则（**与蓝图冲突时以它为准**）
3. [docs/rewrite-blueprint.md](docs/rewrite-blueprint.md) —— 蓝图入口：产品终局、优先级规则、里程碑、不变量
4. 当前阶段的 [docs/blueprint/](docs/blueprint/) 阶段文档 + [目标架构](docs/blueprint/architecture.md)
5. 代码现状 [docs/architecture.md](docs/architecture.md)；测试覆盖 [docs/testing.md](docs/testing.md)

## 工作循环

1. **领一条**：从 [docs/blueprint/PROGRESS.md](docs/blueprint/PROGRESS.md) 的「待领」按顺序领**一条**差距条目，登记到「进行中」。一次只做一条。
2. **读上下文**：该条目所在阶段文档 + 蓝图 [目标架构](docs/blueprint/architecture.md) 对应小节 + 相关决策（[principles.md](docs/blueprint/principles.md) 决策记录）。
3. **实现**：提交粒度 = 一件事（含它带来的连带精简，见蓝图入口 §2）。
4. **自检**：按条目「验收」栏验证，必须用**具体命令**（grep / ESLint 规则 / `npm run db:verify` / 测试），不是「看起来改好了」。把验证命令与结果写进提交说明。
5. **销条目**：更新 PROGRESS.md（状态表加行、从阶段文档差距清单删行、移出「进行中」）。
6. **顺手清理**本次改动产生的无用代码（[dev-guide.md](docs/dev-guide.md) §5.1）。

## 验证命令基线

| 目的 | 命令 |
|---|---|
| 全量测试 | `npm test`（分域：`test:domain` / `test:api` / `test:web`） |
| Lint | `npm run lint` |
| 类型检查 | `npm run typecheck` |
| 数据自检（不变量交叉比对） | `npm run db:verify` |
| 备份恢复演练 | `npm run db:drill` |
| E2E | `npm run test:e2e` |
| 条目专项 | 用条目「验收」栏写明的 grep 模式 / ESLint 规则 / `EXPLAIN QUERY PLAN` 等 |

## 硬规则

- [principles.md](docs/blueprint/principles.md) 的「决策记录」「反模式清单」与 dev-guide 的 checklist 是硬约束。
- **决策落地时，同一次提交把操作规则同步进 dev-guide**（principles.md 开头的传播规则）——否则按旧规则写出的代码会在 review 时返工。
- [不变量](docs/rewrite-blueprint.md)按表内「生效于」列检查：未到生效里程碑的不变量**不提前实现**，也不视为违规。
- 触发条件未出现的条目（阶段 4 / 候选池）不开工；对应 spike（V1–V5）先于主线承诺。
- 一次性 / 探索性脚本不留在仓库（spike 结论写进阶段文档或 ADR，演示代码删掉）。
