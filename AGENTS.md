# AGENTS.md — AI 会话开发约定

MoneyBrain 采用「单人 + AI 会话」方式开发。本文件是每次会话的入口；对人类协作者同样适用。

## 文档读法（按序）

1. 本文件 —— 工作方式
2. [README.md](README.md) —— 唯一入口：命令、目录、文档索引、冲突裁决
3. [docs/dev-guide.md](docs/dev-guide.md) —— 可执行规则（**与计划冲突时以它为准**）
4. [docs/roadmap.md](docs/roadmap.md) —— 只写待办：目标态、顺序、有效决策、非目标
5. 按改动类型选读：[architecture.md](docs/architecture.md) 代码现状 / [requirements.md](docs/requirements.md) 账务口径 / [ui-design.md](docs/ui-design.md) 界面规范 / [testing.md](docs/testing.md) 测试覆盖

## 工作循环

1. **领一条**：从 [docs/roadmap.md](docs/roadmap.md) §3 的待办表按通道领**一条**，同一会话一次只做一条；并行会话只改自己条目涉及的文件，不得带入他人未提交改动。
2. **读上下文**：条目对应的现状文档 + 相关有效决策（roadmap §5）。
3. **实现 + 自检**：提交粒度 = 一件事（含连带精简）；按条目「验收」栏用**具体命令**验证，不是「看起来改好了」。基线命令见 [dev-guide.md](docs/dev-guide.md) §9.1，验证命令与结果写进提交说明。
4. **销条目**：把该行从 roadmap 待办表删掉；**不在文档里记完成记录**，细节回 git 历史。
5. **顺手清理**：本次改动产生的无用代码、旧实现、临时脚本当场删掉，删前先确认零引用（[dev-guide.md](docs/dev-guide.md) §5.1）。

## 硬规则

- roadmap §5 的「有效决策」与 [dev-guide.md](docs/dev-guide.md) 的 checklist 是硬约束；**决策落地时，同一次改动把操作规则同步进 dev-guide**，否则按旧规则写出的代码会返工。
- 同一事实只写在一个文档；账务口径只在 `packages/domain` 与 requirements 里定义，金额全链路整数分。
- 触发条件未出现的条目（按需扩展 / 候选池）不开工；对应 spike 先于主线承诺。
- 一次性 / 探索性脚本不留在仓库，结论写进文档或 ADR，演示代码删掉。
- **不自动 git commit / push**；提交与否由用户决定。提交信息格式见 [dev-guide.md](docs/dev-guide.md) §10.1。
