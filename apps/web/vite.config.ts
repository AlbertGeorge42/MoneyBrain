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
  // 桌面启动器用 127.0.0.1 探活，显式绑 IPv4：Windows 上默认只监听 ::1。
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
