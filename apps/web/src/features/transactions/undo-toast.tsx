import { UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'

/** 删除后的撤销 toast：流水页与总览页共用同一套文案与行为。 */
export function showUndoToast(id: string, message: string, onUndo: () => void) {
  notifications.show({
    id,
    autoClose: 6000,
    withCloseButton: false,
    message: (
      <div className="hf-toast">
        <span>{message}</span>
        <UnstyledButton
          className="hf-toast-action"
          onClick={() => {
            onUndo()
            notifications.hide(id)
          }}
        >
          撤销
        </UnstyledButton>
      </div>
    ),
  })
}
