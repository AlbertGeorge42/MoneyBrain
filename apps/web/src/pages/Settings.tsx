import React from 'react'
import { PageHeader } from '../components/common'
import ReportConfigSection from '../components/settings/ReportConfigSection'
import ThemeSection from '../components/settings/ThemeSection'
import DataBackupSection from '../components/settings/DataBackupSection'
import DangerZoneSection from '../components/settings/DangerZoneSection'

const Settings: React.FC = () => {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="设置与数据"
        description="管理分类配置、主题、备份和高风险操作。"
      />

      {/* ── 配置 ── */}
      <ReportConfigSection />

      {/* ── 偏好 ── */}
      <ThemeSection />

      {/* ── 数据 ── */}
      <DataBackupSection />

      {/* ── 危险操作 ── */}
      <DangerZoneSection />

      {/* ── 版本信息 ── */}
      <footer className="settings-footer">
        MoneyBrain v1.0.0 · 数据存储在本地
      </footer>
    </>
  )
}

export default Settings
