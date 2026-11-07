/**
 * 设置 · 回收站分区。
 *
 * 真实数据源下由 RecycleBinPanel 读取回收站；演示数据源只展示空态说明。
 */
import { Trash2 } from 'lucide-react'
import type { Ledger } from '@/features/overview/model'
import { RecycleBinPanel } from './RecycleBinSection'

interface TrashSectionProps {
  apiMode: boolean
  ledger: Ledger
}

export function TrashSection({ apiMode, ledger }: TrashSectionProps) {
  return apiMode ? (
    <RecycleBinPanel ledger={ledger} />
  ) : (
    <div className="mb-set-list-empty is-tall">
      <Trash2 size={24} />
      <p>回收站是空的</p>
      <span>删除流水后 6 秒内可在提示中撤销；过期后才会进入这里。</span>
    </div>
  )
}
