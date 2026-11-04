import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import ErrorBoundary from './components/common/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Reports from './pages/Reports'
import Budgets from './pages/Budgets'
import Settings from './pages/Settings'

const HfPreview = React.lazy(() => import('./app/design/HfPreview'))
const ProdShell = React.lazy(() =>
  import('./app/prod/ProdShell').then((module) => ({ default: module.ProdShell })))

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/design"
            element={
              <React.Suspense fallback={null}>
                <HfPreview />
              </React.Suspense>
            }
          />
          <Route
            path="/dashboard"
            element={
              <React.Suspense fallback={null}>
                <ProdShell page="overview" />
              </React.Suspense>
            }
          />
          <Route
            path="/transactions"
            element={
              <React.Suspense fallback={null}>
                <ProdShell page="transactions" />
              </React.Suspense>
            }
          />
          <Route
            path="/reports"
            element={
              <React.Suspense fallback={null}>
                <ProdShell page="reports" />
              </React.Suspense>
            }
          />
          <Route path="/legacy" element={<MainLayout />}>
            <Route index element={<Navigate to="/legacy/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/budgets" element={<Navigate to="/legacy/budgets" replace />} />
          <Route path="/settings" element={<Navigate to="/legacy/settings" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
