import React from 'react'
import { Modal, Radio, TreeSelect, Alert } from 'antd'

interface TreeNode {
  id: string
  name: string
  categoryType: 'income' | 'expense' | 'transfer'
}

interface DeleteConfirmModalProps {
  visible: boolean
  category: TreeNode | null
  transactionCount: number
  deleteAction: 'transfer' | 'delete'
  transferTargetId: string | null
  loading: boolean
  transferTargetTreeData: { value: string; title: string; children?: any[] }[]
  onDeleteActionChange: (action: 'transfer' | 'delete') => void
  onTransferTargetChange: (id: string | null) => void
  onConfirm: () => void
  onCancel: () => void
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  category,
  transactionCount,
  deleteAction,
  transferTargetId,
  loading,
  transferTargetTreeData,
  onDeleteActionChange,
  onTransferTargetChange,
  onConfirm,
  onCancel,
}) => (
  <Modal
    title="删除分类确认"
    open={visible}
    onCancel={onCancel}
    onOk={onConfirm}
    okText="确认删除"
    okButtonProps={{ danger: true, loading }}
    cancelText="取消"
  >
    {category && (
      <>
        <p><strong>分类名称：</strong>{category.name}</p>
        <p><strong>分类类型：</strong>{category.categoryType === 'income' ? '收入' : category.categoryType === 'expense' ? '支出' : '转账'}</p>
        <p><strong>关联交易：</strong>{transactionCount} 笔</p>
        
        {transactionCount > 0 && (
          <>
            <Alert 
              message="请选择交易处理方式" 
              type="warning" 
              style={{ marginBottom: 16 }} 
            />
            <Radio.Group 
              value={deleteAction} 
              onChange={(e) => onDeleteActionChange(e.target.value)}
              style={{ width: '100%' }}
            >
              <div style={{ marginBottom: 12 }}>
                <Radio value="transfer">转移到其他分类</Radio>
                {deleteAction === 'transfer' && (
                  <TreeSelect
                    style={{ width: '100%', marginTop: 8, marginLeft: 24 }}
                    placeholder="请选择目标分类"
                    treeData={transferTargetTreeData}
                    value={transferTargetId}
                    onChange={onTransferTargetChange}
                    treeNodeFilterProp="title"
                  />
                )}
              </div>
              <div>
                <Radio value="delete">同时删除关联交易</Radio>
                {deleteAction === 'delete' && (
                  <Alert 
                    message="此操作不可恢复" 
                    type="error" 
                    style={{ marginTop: 8, marginLeft: 24 }} 
                    showIcon
                  />
                )}
              </div>
            </Radio.Group>
          </>
        )}
      </>
    )}
  </Modal>
)

export default DeleteConfirmModal
