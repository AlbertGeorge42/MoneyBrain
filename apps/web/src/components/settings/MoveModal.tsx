import React from 'react'
import { Modal, Form, TreeSelect } from 'antd'

interface TreeNode {
  id: string
  name: string
  categoryType: 'income' | 'expense' | 'transfer'
  parentId?: string
}

interface MoveTreeDataNode {
  value: string
  title: string
  disabled?: boolean
}

interface MoveModalProps {
  visible: boolean
  category: TreeNode | null
  targetId: string | null | undefined
  loading: boolean
  targetTreeData: MoveTreeDataNode[]
  currentPositionLabel: string
  onTargetChange: (val: string | null | undefined) => void
  onConfirm: () => void
  onCancel: () => void
}

const MoveModal: React.FC<MoveModalProps> = ({
  visible,
  category,
  targetId,
  loading,
  targetTreeData,
  currentPositionLabel,
  onTargetChange,
  onConfirm,
  onCancel,
}) => (
  <Modal
    title="移动分类"
    open={visible}
    onCancel={onCancel}
    onOk={onConfirm}
    okText="确认移动"
    okButtonProps={{ loading }}
    cancelText="取消"
  >
    {category && (
      <>
        <p><strong>当前分类：</strong>{category.name}</p>
        <p><strong>当前位置：</strong>{currentPositionLabel}</p>
        <Form layout="vertical">
          <Form.Item label="移动到">
            <TreeSelect
              style={{ width: '100%' }}
              placeholder="请选择目标位置"
              treeData={targetTreeData}
              value={targetId === null ? 'null' : targetId}
              onChange={(val) => onTargetChange(val === 'null' ? null : val)}
              treeNodeFilterProp="title"
              allowClear
            />
          </Form.Item>
        </Form>
      </>
    )}
  </Modal>
)

export default MoveModal
