import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 端到端测试配置
 * 支持多浏览器、多视口测试
 */
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './test-results',

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
      command: 'npm run dev:api',
      url: 'http://localhost:3001/api/accounts',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'npm run dev:web',
      url: 'http://localhost:3002',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
})
