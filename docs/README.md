# MoneyBrain 文档索引

## 当前状态

项目正在从「按页面/交易类型分支」迁移到「统一记账内核 + 分层应用」。
仓库已切换到 npm workspaces（`apps/*` + `packages/*`），业务重构仍在进行。
先读 `rewrite-blueprint.md` 了解目标，再读 `dev-guide.md` 了解当前约束。

| 文档 | 说明 |
|---|---|
| [rewrite-blueprint.md](rewrite-blueprint.md) | 目标架构、代码风格、交互与 UI/UX 重设计 |
| [audit-report.md](audit-report.md) | 全量审计：P0–P3 问题、证据、验收标准 |
| [dev-guide.md](dev-guide.md) | 开发规范：领域规则、命名、API、DB、迁移状态 |
| [architecture.md](architecture.md) | 架构与数据流、领域不变量 |
| [testing.md](testing.md) | 测试层级、命令、Mock 与回归清单 |
| [requirements.md](requirements.md) | 产品需求与设计原则 |

## 代码入口

| 位置 | 说明 |
|---|---|
| `packages/domain/` | 记账内核，算钱的唯一位置 |
| `packages/contracts/` | 前后端 API 类型、树工具（待引入 zod） |
| `apps/api/src/services/` | API 业务编排 |
| `apps/web/src/pages/` | 5 个页面 |

## 文档规则

- 文件名 kebab-case。
- 文档必须与当前代码一致；目标态内容明确标注「目标」。
- 过时文档直接删除，不保留历史副本。
- 代码注释中文，标识符英文。
