import React from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { colorActionPrimary, colorOnActionPrimary, shadowPanel } from '../../styles/tokens'

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
        backgroundColor: colorActionPrimary,
        color: colorOnActionPrimary,
        border: 'none',
        boxShadow: shadowPanel,
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
