import React, { useState } from 'react'
import { Alert, App, Button, Card, Input, Skeleton, Switch, Typography, theme } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useAutoBackupConfig, useSaveAutoBackupConfig } from '../../queries'
import { getApiErrorMessage } from '../../services/apiError'
import { useNotify } from '../../hooks/useNotify'
import { ErrorState } from '../common'
import dayjs from 'dayjs'
import type { AutoBackupConfig } from '../../services/api'

const { Text } = Typography

/**
 * 自动定时备份（B3）：用户只设置总开关与备份目录，执行时机由软件内部策略决定
 * （距上次成功 ≥ 24h 且系统空闲时自动执行）。云同步目录由后端默认拒绝，
 * 前端收到拒绝后弹明文警告，用户显式确认才重新提交（confirmCloudDirectory）。
 */
const AutoBackupSection: React.FC = () => {
  const { token } = theme.useToken()
  const { modal } = App.useApp()
  const notify = useNotify()
  const configQuery = useAutoBackupConfig()
  const saveMutation = useSaveAutoBackupConfig()

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [directory, setDirectory] = useState<string | null>(null)

  const config: AutoBackupConfig | undefined = configQuery.data
  // 表单未改动前跟随服务端配置；改动后以本地为准
  const effectiveEnabled = enabled ?? config?.enabled ?? false
  const effectiveDirectory = directory ?? config?.directory ?? ''

  const save = () => {
    if (effectiveEnabled && !effectiveDirectory.trim()) {
      notify.error('请先填写备份目录')
      return
    }

    const submit = async (confirmCloudDirectory: boolean) => {
      try {
        await saveMutation.mutateAsync({
          enabled: effectiveEnabled,
          directory: effectiveDirectory.trim(),
          ...(confirmCloudDirectory ? { confirmCloudDirectory: true } : {}),
        })
        notify.success('自动备份设置已保存')
        setEnabled(null)
        setDirectory(null)
      } catch (error) {
        const message = getApiErrorMessage(error, '保存失败')
        // 后端默认拒绝云同步目录：把明文警告摆给用户，确认后才带 confirm 重新提交
        if (message.includes('云同步目录')) {
          modal.confirm({
            title: '目标目录疑似云同步目录',
            icon: <AppstoreOutlined />,
            okType: 'danger',
            okText: '仍要使用该目录',
            cancelText: '换一个目录',
            content: (
              <p style={{ color: token.colorTextSecondary, margin: 0 }}>
                自动备份在加密容器落地前导出的是明文 ZIP，
                开启后将<strong style={{ color: token.colorError }}>定时产生全量明文账本副本</strong>并同步到云端。
                确认继续吗？
              </p>
            ),
            onOk: () => submit(true),
          })
          return
        }
        notify.error(message)
      }
    }

    void submit(false)
  }

  return (
    <Card className="surface-card" title="自动备份">
      {configQuery.isError ? (
        <ErrorState
          variant="inline"
          title="自动备份配置加载失败"
          error={configQuery.error}
          onRetry={() => void configQuery.refetch()}
        />
      ) : configQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <p className="settings-desc">
            开启后软件自动选择时机备份（距上次成功超过一天、且系统空闲时执行），无需设置时刻。
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: token.paddingSM }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: token.paddingSM }}>
              <Switch
                checked={effectiveEnabled}
                onChange={(checked) => setEnabled(checked)}
              />
              <Text>{effectiveEnabled ? '已开启' : '未开启'}</Text>
            </div>

            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: token.marginXXS }}>
                备份目录（绝对路径，默认数据库同级 auto-backups/）
              </Text>
              <Input
                value={effectiveDirectory}
                placeholder={config?.defaultDirectory}
                onChange={(e) => setDirectory(e.target.value)}
              />
            </div>

            <div>
              <Button
                type="primary"
                loading={saveMutation.isPending}
                onClick={save}
              >
                保存
              </Button>
            </div>

            {/* 只读状态：时机由内部策略决定，这里只展示事实 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: token.marginXXS }}>
              {config?.lastRunAt ? (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  上次自动备份：{dayjs(config.lastRunAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  还没有自动备份过。
                </Text>
              )}
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {config?.nextWindowAt
                  ? `预计下次备份：${dayjs(config.nextWindowAt).format('YYYY-MM-DD HH:mm')} 后的第一个空闲窗口`
                  : '开启后将在系统空闲时执行首次备份'}
              </Text>
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                目录内现有备份 {config?.backupCount ?? 0} 份。
              </Text>
            </div>

            {config?.lastRunError && (
              <Alert type="error" showIcon message={`上次自动备份失败：${config.lastRunError}`} />
            )}
          </div>
        </>
      )}
    </Card>
  )
}

export default AutoBackupSection
