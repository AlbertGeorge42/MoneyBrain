import { vi } from 'vitest'

// 全局测试配置

// Mock console.error 在测试中避免噪音，但保留错误信息供调试
const originalError = console.error
console.error = (...args: unknown[]) => {
  // 过滤掉已知的 React/Testing 警告
  const message = args[0]?.toString() || ''
  if (
    message.includes('Warning:') ||
    message.includes('Error:') && message.includes('test')
  ) {
    return
  }
  originalError(...args)
}

// 全局超时设置
vi.setConfig({ testTimeout: 10000 })
