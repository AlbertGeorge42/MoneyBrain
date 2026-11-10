# MoneyBrain

个人记账软件。本地 SQLite、单用户、数据不出本机。前端 React + Vite，后端 Express + Prisma，金额计算收敛到纯 TypeScript 领域内核 `packages/domain`。

**核心约束：同一笔钱只允许有一套算法。** 余额、收支表、现金流量表、预算、投资分析最终都是同一组分录的投影，因此不会出现「首页和报表数字对不上」。

> **本文是唯一入口。** 人和 AI 协作者都从这里开始：先看「文档索引」确定该读哪一篇，再按「动手前」清单准备。
> 当前形态（2026-11-10）：PC 端已按高保真设计重建并精简，生产入口只有 `apps/web/src/app/design/DesignApp.tsx`；桌面端有 Electron 壳与 Windows 安装包链路。剩余工作见 [docs/roadmap.md](docs/roadmap.md)。

## 快速开始

```bash
npm install     # 安装全部 workspace（postinstall 会自动 prisma generate）
npm run dev     # 前后端一起启动：API :3001，前端 :3002
```

打开 http://localhost:3002。首次使用先在「设置 → 账户分类 / 账户」创建账户，再到「流水」记第一笔。

**数据库连接串必须显式提供**：`schema.prisma` 的 datasource 用 `env("DATABASE_URL")`，没有默认值。
`npm run dev` 与各 db 脚本经 `scripts/with-database-url.mjs` 注入默认开发库 `apps/api/prisma/dev.db` 的绝对路径，启动日志会打印当前库路径与流水总笔数。绕过 npm 直接启动 API / 脚本时，未设置 `DATABASE_URL` 会直接报错退出，不会静默连 dev.db。要指向别的库：

```powershell
$env:DATABASE_URL='file:C:/path/to/ledger.db'; npm run dev
```

不要为了「让页面有数据」直接往 `dev.db` 写测试数据；脚本要写真实库必须传 `--allow-real`（会先自动整份备份并打印 SHA256）。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` / `dev:api` / `dev:web` | 启动前后端（可单独启动） |
| `npm run build` / `npm start` | 构建 web + api / 启动生产预览（API + vite preview :4173） |
| `npm run desktop:stage` / `desktop:run` | 暂存 Electron 应用目录 / 用 Electron 启动（开发态） |
| `npm run desktop:pack` / `desktop:dist` | 产出免安装目录 / NSIS 安装包 |
| `npm run desktop` / `desktop:open` / `desktop:build` | 旧 Edge 应用模式启动器（开发态保留，见下） |
| `npm run lint` / `typecheck` / `test` | lint api+web / typecheck domain+sync+api+web / 测试 domain+sync+api+web |
| `npm run test:e2e` | Playwright（每次在 `%TEMP%\moneybrain-e2e-<PID>` 建独占临时库，不读写 `dev.db`） |
| `npm run db:migrate` / `db:status` | 生成并应用版本化迁移 / 查看迁移差异 |
| `npm run db:verify` / `db:drill` | 数据自检（重算净资产恒等式、转账、退款）/ 恢复演练（备份可信度） |
| `npm run sync:decrypt` | 用恢复码独立解开 `.mbx` 容器 |

单独跑某一层：`npm run test:domain` / `test:sync` / `test:api` / `test:web`。

改完必须跑：`npm run test:domain && npm run lint && npm run typecheck && npm test && npm run build`；涉及后端 schema 时额外跑 `npm run test:integration -w @moneybrain/api`。完整清单见 [docs/dev-guide.md](docs/dev-guide.md) §9.1。

## 桌面端

**当前形态是 Electron**（`apps/desktop/`）：`src/main.cjs` 以 `ELECTRON_RUN_AS_NODE` 子进程在**空闲随机端口**启动 API，用 `WEB_DIST` 让 API 同端口托管前端产物（未知 `/api` 仍返回 JSON 信封），再用 `BrowserWindow` 打开本地页面。账本固定在 `app.getPath('userData')/data/moneybrain.db`，启动时幂等迁移，**绝不读取仓库里的 `dev.db`**；单实例由 `requestSingleInstanceLock()` 保证。`electron-builder.yml` 产出 `nsis` 安装包与 `portable` 免安装目录，配置为**卸载不删账本**。

- 打包产物自带 Chromium 与 Node 运行时，可分发给未装 Node / Edge 的机器；**没有代码签名、没有自动更新**，这两项未做真机验收。
- 前置：Windows + Node.js 20+（仅构建期需要）；不再需要 Rust 工具链，也不依赖本机 Edge。
- `MoneyBrain.cmd` 与 `npm run desktop*` 仍走旧 `scripts/desktop.mjs`（Edge `--app` + 9333 调试端口 + 临时 profile 锁），只作开发态快捷入口，不是可分发产物。两套链路并存时以 Electron 链路为准。
- 数据库仍是本地 SQLite；开发态在 `apps/api/prisma/dev.db`，打包版在 `userData/data/moneybrain.db`。

## 目录

```
MoneyBrain/
├── apps/
│   ├── api/                # Express + Prisma API（routes → services → domain）
│   ├── web/                # React + Vite SPA（features/<domain> → services/api）
│   └── desktop/            # Electron 壳与 Windows 打包链路
├── packages/
│   ├── domain/             # 记账内核：金额、日期、分录、汇总（算钱的唯一位置）
│   ├── contracts/          # 前后端共享的 API 类型、错误码、常量与文案目录
│   └── sync/               # 记录级合并与加密容器（传输未接）
├── e2e/                    # Playwright 端到端测试
├── scripts/                # 构建、数据自检、恢复演练、迁移封装
├── data/qianji/            # 本地原始账本导出（不入库）
└── docs/                   # 见下方文档索引
```

## 动手前

1. **读规范**：[docs/dev-guide.md](docs/dev-guide.md)（代码必须怎么写，含领域规则、命名、导出、错误协议、数据库、提交格式）。
2. **找代码**：[docs/architecture.md](docs/architecture.md)（东西在哪、怎么流动）。
3. **对口径**：[docs/requirements.md](docs/requirements.md)（这个数字应该等于什么）。
4. **看界面**：[docs/ui-design.md](docs/ui-design.md)（视觉、交互、未来报表口径）。
5. **排计划**：[docs/roadmap.md](docs/roadmap.md)（该做什么、还差什么）。

金额影响只有一个实现（走 `packages/domain` 的 `postingsOf` / `summarizeFlows` / `remainingRefundable`），金额全链路整数分，元只出现在输入框与文件边界；失败不得伪装成 0 或空列表。展开见 dev-guide §3 与 requirements §3。

**禁止自动 git commit / push**，除非明确要求。

## 文档索引

| 文档 | 回答什么 | 什么时候读 |
|---|---|---|
| [docs/requirements.md](docs/requirements.md) | 做什么产品、账务口径、不变量定义、设计原则 | 讨论需求、判断某个数字对不对 |
| [docs/architecture.md](docs/architecture.md) | 现在代码怎么组织：分层、领域内核、后端模块、前端数据流、数据库模型、桌面端 | 找代码在哪、改动会影响谁 |
| [docs/dev-guide.md](docs/dev-guide.md) | 新代码必须怎么写：领域规则、命名、导出、类型、错误协议、数据库、测试、提交格式 | **动手写代码前必读** |
| [docs/testing.md](docs/testing.md) | 测试放在哪、怎么跑、不变量覆盖情况 | 加测试、跑验证 |
| [docs/ui-design.md](docs/ui-design.md) | 信息架构、视觉 token、交互、双端差异、未来报表唯一口径 | 改界面、判断交互与推演口径 |
| [docs/sync-container-format.md](docs/sync-container-format.md) | `.mbx` 加密容器字节格式 | 改容器、写跨端解密 |
| [docs/roadmap.md](docs/roadmap.md) | 目标态、还差什么、按什么顺序改、有效决策与非目标 | 规划下一批工作、判断改动该不该做 |

### 冲突时以谁为准

1. **当前可执行的规范以 [docs/dev-guide.md](docs/dev-guide.md) 为准**；[docs/roadmap.md](docs/roadmap.md) 是计划，与现状不一致不是 bug，而是待办。
2. [docs/requirements.md](docs/requirements.md) 是**账务口径的权威**；代码与它不一致时，代码是错的（除非先改需求）。
3. 每份文档只负责一个视角；同一事实只在一个文档里写，不重复、不交叉。

### 维护规则

- 文件名 kebab-case；文档必须与代码一致，不一致就当场改齐，不留「以后再说」。
- **过时文档直接删除，不保留历史副本**（历史在 git 里）；一次性审计、评估、走查脚本不入库。
- 计划文档只写待办；新实现的特性更新到对应的现状文档，不在计划里记完成记录。
- 改代码时同步改受影响的文档与代码注释里的文档路径；新增文档必须登记进上方索引。
- 文档里的文件路径、命令、测试数量必须与仓库一致；不确定就先查再写。
