import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * 每次运行一个唯一临时目录（按主进程 PID），并发跑 e2e 不会互删对方的库。
 * 建库由 scripts/e2e-api.mjs 完成（复制 schema/迁移后 migrate deploy），没有 globalSetup。
 */
const E2E_DB_DIR = path.join(os.tmpdir(), `moneybrain-e2e-${process.pid}`)
const E2E_DB_URL = `file:${path.join(E2E_DB_DIR, 'e2e.db').replace(/\\/g, '/')}`
// global-teardown 在同一个主进程里读取该变量，只清理本次运行的目录。
process.env.MB_E2E_DIR = E2E_DB_DIR

/**
 * Playwright 端到端测试配置
 * 支持多浏览器、多视口测试
 *
 * 写库隔离：API 连 scripts/e2e-api.mjs 建出的临时 SQLite 库（%TEMP%/moneybrain-e2e-<PID>），
 * 不再读写 apps/api/prisma/dev.db；3001/3002 均不允许复用已有服务，避免误连真实账本或他人的
 * dev server（端口被占用时 Playwright 会直接报错退出，而不是静默复用）。
 */
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './test-results',

  /* 临时库：API 包装脚本建库、结束后由本目录的 teardown 删除 */
  globalTeardown: './e2e/global-teardown.ts',

  /* 测试文件匹配模式 */
  testMatch: '**/*.spec.ts',

  /* 完全并行运行测试 */
  fullyParallel: true,

  /* 失败时禁止重复运行 */
  forbidOnly: !!process.env.CI,

  /* 重试次数（CI 环境 2 次，本地 0 次） */
  retries: process.env.CI ? 2 : 0,

  /* 并行工作进程数 */
  workers: process.env.CI ? 1 : undefined,

  /* 报告器配置 */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  /* 共享测试配置 */
  use: {
    /* 基础 URL */
    baseURL: 'http://localhost:3002',

    /* 收集所有请求的 trace */
    trace: 'on-first-retry',

    /* 失败时截图 */
    screenshot: 'only-on-failure',

    /* 失败时录制视频 */
    video: 'on-first-retry',

    /* 视口默认尺寸 */
    viewport: { width: 1280, height: 720 },
  },

  /*
   * 项目配置：统一走系统 Edge（channel: 'msedge'），不依赖 Playwright 浏览器下载。
   * 双端覆盖由用例自己声明 viewport（responsive-* / settings / hf-reports 均如此），
   * 因此只保留一个项目，避免同一用例在两种视口下重复跑导致必然失败——
   * 桌面版 HF 用例在移动视口下本就不成立。
   * 不再保留 Firefox / WebKit：运行环境未安装对应引擎时 `npm run test:e2e` 会直接失败。
   */
  projects: [
    {
      name: 'edge',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],

  /* 本地开发服务器配置 */
  webServer: [
    {
      command: 'node scripts/e2e-api.mjs',
      url: 'http://localhost:3001/api/accounts',
      reuseExistingServer: false,
      timeout: 120000,
      env: { DATABASE_URL: E2E_DB_URL, MB_E2E_DIR: E2E_DB_DIR },
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:3002',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
})
