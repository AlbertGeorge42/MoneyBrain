import React from 'react'
import { Tag, Space } from 'antd'

interface ColorPickerProps {
  value?: string
  onChange?: (color: string) => void
  placeholder?: string
}

const presetColors = [
  'default',
  'red',
  'green',
  'blue',
  'orange',
  'purple',
  'cyan',
  'magenta',
  'gold',
  'lime',
  'geekblue',
  'volcano',
]

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, placeholder }) => {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#999', fontSize: 12 }}>{placeholder || '选择颜色'}</span>
      </div>
      <Space wrap size={[8, 8]}>
        {presetColors.map(color => (
          <Tag
            key={color}
            color={color}
            style={{
              cursor: 'pointer',
              margin: 0,
              border: value === color ? '2px solid #1890ff' : '1px solid #d9d9d9',
              padding: '2px 8px',
            }}
            onClick={() => onChange?.(color)}
          >
            {color === 'default' ? '默认' : color}
          </Tag>
        ))}
      </Space>
    </div>
  )
}

export default ColorPicker
