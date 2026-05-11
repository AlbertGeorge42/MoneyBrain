import React from 'react'
import { PlusOutlined } from '@ant-design/icons'

interface FloatingActionButtonProps {
  onClick: () => void
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 24,
        bottom: 88,
        width: 56,
        height: 56,
        borderRadius: '50%',
        backgroundColor: '#1677ff',
        color: '#fff',
        border: 'none',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        fontSize: 24,
        cursor: 'pointer',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label="记一笔"
    >
      <PlusOutlined />
    </button>
  )
}

export default FloatingActionButton
