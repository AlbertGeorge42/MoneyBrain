import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, '../../packages/contracts'),
      '@domain': path.resolve(__dirname, '../../packages/domain/src'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  // 桌面启动器用 preview 提供构建产物；没有代理时 /api 会落到静态服务器而 404。
  preview: {
    // 显式绑 IPv4：Windows 上默认 localhost 可能只监听 ::1，桌面启动器用 127.0.0.1 探活。
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
