import React from 'react'
import { Tabs, Select, Tag, Typography, Grid } from 'antd'
import DynamicIcon from '../common/DynamicIcon'
import type { AccountAllocationDetail } from '@shared/types'
import dayjs from 'dayjs'

const { Text } = Typography

interface AccountSelectorProps {
  accounts: AccountAllocationDetail[]
  selectedAccountId: string | null
  onChange: (accountId: string) => void
}

const AccountSelector: React.FC<AccountSelectorProps> = ({
  accounts,
  selectedAccountId,
  onChange,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const formatDate = (date: string) => {
    return dayjs(date).format('YYYY-MM-DD')
  }

  // 桌面端：Tab 切换
  if (!isMobile) {
    return (
      <Tabs
        activeKey={selectedAccountId || undefined}
        onChange={onChange}
        items={accounts.map(account => ({
          key: account.accountId,
          label: (
            <span>
              <DynamicIcon name="wallet" size={16} />
              {' '}{account.accountName}
              {account.latestSnapshotDate && (
                <Tag color="green" style={{ marginLeft: 8 }}>
                  {formatDate(account.latestSnapshotDate)}
                </Tag>
              )}
            </span>
          ),
        }))}
        size="small"
        style={{ marginBottom: 16 }}
      />
    )
  }

  // 移动端：下拉选择器
  return (
    <Select
      value={selectedAccountId || undefined}
      onChange={onChange}
      style={{ width: '100%', marginBottom: 16 }}
      options={accounts.map(account => ({
        value: account.accountId,
        label: (
          <span>
            <DynamicIcon name="wallet" size={16} />
            {' '}{account.accountName}
            {account.latestSnapshotDate && (
              <Text type="secondary" style={{ marginLeft: 8 }}>
                ({formatDate(account.latestSnapshotDate)})
              </Text>
            )}
          </span>
        ),
      }))}
    />
  )
}

export default AccountSelector