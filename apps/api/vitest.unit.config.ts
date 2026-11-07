import { defineConfig } from 'vitest/config'
import { ensureTestRunDir } from './tests/test-run-dir.ts'

// 单元测试里也有真实 SQLite 用例（回滚点、导入预览），同样需要隔离的模板库。
ensureTestRunDir()

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/unit',
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'prisma/',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
})
