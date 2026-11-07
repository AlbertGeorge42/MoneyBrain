import React, { Component, type ReactNode } from 'react'

import { Card } from '@/features/shared/Card'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * 渲染期兜底：复用共享卡片外壳的错误面板变体（shared/card.css），不依赖组件库
 * ——组件库本身抛错时这里仍要能画出来。
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mb-hf-root">
          <Card variant="state" tone="danger" role="alert">
            <div className="mb-errorpanel-mark" aria-hidden="true">
              !
            </div>
            <h2 className="mb-errorpanel-title">页面出错了</h2>
            <p className="mb-errorpanel-desc">请刷新页面重试</p>
            <div className="mb-errorpanel-actions">
              <button
                type="button"
                className="mb-primary-btn"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
