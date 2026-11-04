import { UnstyledButton } from '@mantine/core'
import type { ColorScheme } from '../../styles/theme/tokens'
import type { DataState, DeviceMode } from '../../features/transactions/types'

type PreviewBarProps = {
  device: DeviceMode
  scheme: ColorScheme
  dataState: DataState
  onDeviceChange: (value: DeviceMode) => void
  onSchemeChange: (value: ColorScheme) => void
  onDataStateChange: (value: DataState) => void
}

const DEVICE_OPTIONS: Array<{ value: DeviceMode; label: string }> = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: '移动' },
]

const SCHEME_OPTIONS: Array<{ value: ColorScheme; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '暗色' },
]

const STATE_OPTIONS: Array<{ value: DataState; label: string }> = [
  { value: 'ready', label: '正常' },
  { value: 'loading', label: '加载' },
  { value: 'empty', label: '冷启动' },
  { value: 'error', label: '错误' },
]

type PreviewGroupProps<T extends string> = {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

function PreviewGroup<T extends string>({ label, options, value, onChange }: PreviewGroupProps<T>) {
  return (
    <div className="hf-preview-group" role="group" aria-label={label}>
      <span className="hf-preview-label">{label}</span>
      {options.map((option) => (
        <UnstyledButton
          key={option.value}
          className="hf-preview-option"
          data-active={value === option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </UnstyledButton>
      ))}
    </div>
  )
}

export function PreviewBar({
  device,
  scheme,
  dataState,
  onDeviceChange,
  onSchemeChange,
  onDataStateChange,
}: PreviewBarProps) {
  return (
    <div className="hf-preview-bar">
      <div className="hf-preview-title">
        <span className="hf-preview-tag">HF 设计预览</span>
        <span className="mb-text-0">预览控件不属于产品 UI；真实 API 接线留待 R 批次</span>
      </div>
      <div className="hf-preview-controls">
        <PreviewGroup label="设备" options={DEVICE_OPTIONS} value={device} onChange={onDeviceChange} />
        <PreviewGroup label="配色" options={SCHEME_OPTIONS} value={scheme} onChange={onSchemeChange} />
        <PreviewGroup label="数据态" options={STATE_OPTIONS} value={dataState} onChange={onDataStateChange} />
        <a className="hf-preview-link" href="/transactions">旧版流水</a>
      </div>
    </div>
  )
}
