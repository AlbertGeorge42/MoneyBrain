import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import type { InvestmentTypeRow } from './model'
import { EditorSheet } from './EditorSheet'
import { MoverSheet } from './MoverSheet'
import { CategoryDeleteSheet } from './CategoryDeleteSheet'
import type { LedgerConfigController } from './useLedgerConfigController'

/**
 * 共享的编辑 / 移动 / 转移删除抽屉。
 *
 * 设置页与报表页渲染同一份组件和同一份 controller 状态，避免出现第二套表单。
 */
export function LedgerConfigSheets({
  controller,
  device,
  ledger,
  investRows,
}: {
  controller: LedgerConfigController
  device: DeviceMode
  ledger: Ledger
  investRows: readonly InvestmentTypeRow[]
}) {
  const { editor, mover, deleteTransfer } = controller

  return (
    <>
      {editor && (
        <EditorSheet
          editor={editor}
          device={device}
          ledger={ledger}
          investRows={investRows}
          error={controller.editorError}
          saving={controller.editorSaving}
          onClose={() => controller.setEditor(null)}
          onSave={controller.saveEditor}
          onDelete={
            (editor.kind === 'account' || editor.kind === 'accountGroup') &&
            editor.mode === 'edit'
              ? controller.deleteEditorTarget
              : undefined
          }
          onMove={
            (editor.kind === 'account' || editor.kind === 'accountGroup') &&
            editor.mode === 'edit'
              ? controller.moveEditorTarget
              : undefined
          }
        />
      )}
      {mover && (
        <MoverSheet
          mover={mover}
          device={device}
          ledger={ledger}
          error={controller.moverError}
          saving={controller.moverSaving}
          onClose={() => controller.setMover(null)}
          onMove={(target) => void controller.move(target)}
        />
      )}
      {deleteTransfer && (
        <CategoryDeleteSheet
          row={deleteTransfer.row}
          type={deleteTransfer.type}
          device={device}
          ledger={ledger}
          error={controller.deleteError}
          saving={controller.deleteSaving}
          onClose={() => controller.setDeleteTransfer(null)}
          onTransfer={(target) => void controller.transferAndDelete(target)}
        />
      )}
    </>
  )
}
