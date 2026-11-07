import { defineConfig } from 'vitest/config'
import { ensureTestRunDir } from './tests/test-run-dir.ts'

// 本次运行的独占临时目录；globalSetup 在这里建模板库，worker 从中复制各自的库。
ensureTestRunDir()

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/integration',
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
