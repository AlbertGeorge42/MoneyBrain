import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/common/ErrorBoundary'

const DesignApp = lazy(() => import('./app/design/DesignApp'))

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* 设计预览面只在开发构建可用；生产包不注册该路由，/design 落回应用入口。 */}
          {import.meta.env.DEV && (
            <Route
              path="/design"
              element={
                <Suspense fallback={null}>
                  <DesignApp />
                </Suspense>
              }
            />
          )}
          <Route
            path="*"
            element={
              <Suspense fallback={null}>
                <DesignApp preview={false} />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
