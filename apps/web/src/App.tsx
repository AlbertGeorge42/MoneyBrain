import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/common/ErrorBoundary'

const DesignApp = lazy(() => import('./app/design/DesignApp'))

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
