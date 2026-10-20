import React, { useState } from 'react'
import { Card } from 'antd'
import {
  BankOutlined,
  FileTextOutlined,
  SwapOutlined,
  FundOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useAccounts, useAccountCategories, useTransactionCategories } from '../../queries'
import type { Account, AccountCategory, TransactionCategory } from '../../services/api'
import AccountConfigModal from './AccountConfigModal'
import TransactionConfigModal from './TransactionConfigModal'
import CashFlowConfigModal from './CashFlowConfigModal'
import InvestmentAssetClassConfigModal from '../investment/InvestmentAssetClassConfigModal'

/** 键盘事件处理：Enter/Space 触发点击 */
const handleCardKeyDown = (e: React.KeyboardEvent, onClick: () => void) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onClick()
  }
}

const ReportConfigSection: React.FC = () => {
  const [activeModal, setActiveModal] = useState<string | null>(null)

  // 获取实际数据以展示摘要
  const { data: accounts = [] } = useAccounts()
  const { data: accountCategories = [] } = useAccountCategories()
  const { data: transactionCategories = [] } = useTransactionCategories()

  const openModal = (key: string) => setActiveModal(key)
  const closeModal = () => setActiveModal(null)

  // 根据分类类型统计
  const assetCategories = accountCategories.filter((c: AccountCategory) => c.type === 'asset')
  const liabilityCategories = accountCategories.filter((c: AccountCategory) => c.type === 'liability')
  const incomeCategories = transactionCategories.filter((c: TransactionCategory) => c.type === 'income')
  const expenseCategories = transactionCategories.filter((c: TransactionCategory) => c.type === 'expense')
  const transferCategories = transactionCategories.filter((c: TransactionCategory) => c.type === 'transfer')
  const investmentAccounts = accounts.filter((a: Account) => a.category?.isInvestment)

  // 配置入口定义
  const entries = [
    {
      key: 'account',
      title: '账户分类',
      icon: <BankOutlined />,
      summary: `资产 ${assetCategories.length} · 负债 ${liabilityCategories.length}`,
      count: accountCategories.length,
    },
    {
      key: 'transaction',
      title: '收支分类',
      icon: <FileTextOutlined />,
      summary: `收入 ${incomeCategories.length} · 支出 ${expenseCategories.length} · 转账 ${transferCategories.length}`,
      count: transactionCategories.length,
    },
    {
      key: 'cash-flow',
      title: '现金流分类',
      icon: <SwapOutlined />,
      summary: '配置资产与交易的现金流类型',
      count: accountCategories.length,
    },
    {
      key: 'investment',
      title: '投资资产类型',
      icon: <FundOutlined />,
      summary: '配置投资账户的资产类型及比例',
      count: investmentAccounts.length,
    },
  ]

  return (
    <>
      <Card className="surface-card" title="配置中心">
        <p className="settings-desc">
          集中管理各报表的分类与配置，也可在报表页面中直接进入
        </p>
        <div className="config-entry-grid">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="config-entry-card"
              role="button"
              tabIndex={0}
              onClick={() => openModal(entry.key)}
              onKeyDown={(e) => handleCardKeyDown(e, () => openModal(entry.key))}
            >
              <div className="config-entry-card__icon">
                {React.cloneElement(entry.icon as React.ReactElement, {
                  style: { fontSize: 20, color: 'var(--mb-color-action-primary)' },
                })}
              </div>
              <div className="config-entry-card__content">
                <div className="config-entry-card__title">{entry.title}</div>
                <div className="config-entry-card__summary">{entry.summary}</div>
              </div>
              <div className="config-entry-card__count">{entry.count}</div>
              <RightOutlined className="config-entry-card__chevron" />
            </div>
          ))}
        </div>
      </Card>

      {/* 各报表配置弹窗 - 复用现有组件，遵循"多个入口、一个数据源"原则 */}
      <AccountConfigModal
        visible={activeModal === 'account'}
        onClose={closeModal}
      />
      <TransactionConfigModal
        visible={activeModal === 'transaction'}
        onClose={closeModal}
      />
      <CashFlowConfigModal
        visible={activeModal === 'cash-flow'}
        onClose={closeModal}
      />
      <InvestmentAssetClassConfigModal
        visible={activeModal === 'investment'}
        onClose={closeModal}
      />
    </>
  )
}

export default ReportConfigSection
