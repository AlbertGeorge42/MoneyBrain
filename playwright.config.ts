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

  /* 项目配置（多浏览器、多视口） */
  projects: [
    // 桌面端 Chromium
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },

    // 桌面端 Firefox
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
    },

    // 桌面端 WebKit
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
    },

    // 平板端
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7) landscape'],
      },
    },

    // 移动端
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  /* 本地开发服务器配置 */
  webServer: [
    {
      command: 'cd backend && npm run dev',
      url: 'http://localhost:3001/api/accounts',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'cd frontend && npm run dev',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
