import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import ErrorBoundary from './components/common/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Reports from './pages/Reports'
import Budgets from './pages/Budgets'
import Settings from './pages/Settings'

const DesignApp = lazy(() => import('./app/design/DesignApp'))

/**
 * 入口开关：默认高保真（HF）；启动时设 VITE_HF_ENTRY=legacy 即整站退回旧 AntD 前端。
 * 旧页面代码与目录原样保留，回退只改这一个环境变量。
 */
const HF_ENTRY = import.meta.env.VITE_HF_ENTRY !== 'legacy'

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/design"
            element={
              <Suspense fallback={null}>
                <DesignApp />
              </Suspense>
            }
          />
          {HF_ENTRY ? (
            // 生产入口：同一个 HF 组件，关掉预览工具栏与手机框。
            <Route
              path="*"
              element={
                <Suspense fallback={null}>
                  <DesignApp preview={false} />
                </Suspense>
              }
            />
          ) : (
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
