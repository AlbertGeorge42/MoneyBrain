/**
 * 图标选择器 + 颜色选择器 + 复合字段
 */

import React, { useState, useMemo, useRef, useCallback } from 'react'
import { Popover, Input, Tabs, Empty, Form, theme, type InputRef, type FormInstance } from 'antd'
import { Search, Plus, Check } from 'lucide-react'
import { ANTD_PRESET_COLORS, getIconColorTokens, type AntDPresetColor } from '../../utils/colorPalette'
import { useTheme } from '../../styles/ThemeContext'
import DynamicIcon from './DynamicIcon'
import CategoryIcon from './CategoryIcon'

/* ═══════════════════ 类型 ═══════════════════ */

interface IconPickerProps {
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  color?: string | null
}

interface ColorSwatchPickerProps {
  value?: string | null
  onChange?: (value: string | null) => void
  size?: number
  allowClear?: boolean
  disabled?: boolean
}

interface IconColorFieldProps {
  form: FormInstance
  allowClearColor?: boolean
}

/* ═══════════════════ 图标分类数据 ═══════════════════ */

const ICON_CATEGORIES = {
  account: {
    label: '账户类型',
    icons: [
      'wallet', 'wallet-2', 'wallet-cards', 'wallet-minimal',
      'banknote', 'banknote-arrow-down', 'banknote-arrow-up',
      'coins', 'piggy-bank', 'vault',
      'landmark', 'building', 'building-2', 'credit-card', 'qr-code',
      'chart-line', 'chart-bar', 'trending-up', 'candlestick-chart',
      'briefcase', 'gem', 'diamond', 'package', 'box', 'archive',
    ],
  },
  food: {
    label: '餐饮美食',
    icons: [
      'utensils', 'utensils-crossed', 'fork-knife', 'cooking-pot',
      'chef-hat', 'coffee', 'cup-soda', 'glass-water', 'martini',
      'wine', 'beer', 'milk',
      'pizza', 'hamburger', 'sandwich', 'croissant', 'donut',
      'cake', 'cake-slice', 'ice-cream-cone', 'ice-cream-bowl',
      'cookie', 'candy', 'lollipop', 'popcorn',
      'apple', 'banana', 'cherry', 'citrus', 'grape', 'carrot',
      'salad', 'soup', 'egg', 'beef', 'drumstick', 'shrimp',
      'dessert',
    ],
  },
  transport: {
    label: '交通出行',
    icons: [
      'car', 'car-front', 'car-taxi-front',
      'bus', 'bus-front', 'truck', 'van',
      'train', 'train-front', 'train-track', 'tram-front',
      'plane', 'plane-landing', 'plane-takeoff',
      'ship', 'sailboat', 'rocket',
      'bike', 'motorbike', 'scooter',
      'navigation', 'navigation-2', 'fuel', 'ev-charger',
      'parking-circle', 'parking-meter', 'traffic-cone',
      'rail-symbol', 'cable-car',
    ],
  },
  shopping: {
    label: '购物消费',
    icons: [
      'shopping-cart', 'shopping-bag', 'shopping-basket', 'store',
      'tag', 'tags', 'receipt', 'package', 'box',
      'laptop', 'smartphone', 'tablet', 'computer', 'monitor', 'tv',
      'keyboard', 'mouse', 'printer', 'camera', 'headphones',
      'refrigerator', 'microwave', 'washing-machine',
      'heater', 'fan',
      'sofa', 'armchair', 'lamp', 'lamp-desk', 'lamp-floor', 'bed',
    ],
  },
  living: {
    label: '居住生活',
    icons: [
      'home', 'house', 'house-heart', 'building',
      'key', 'key-round', 'key-square',
      'door-open', 'door-closed',
      'bed', 'sofa', 'lamp', 'lamp-ceiling',
      'bath', 'shower-head', 'toilet', 'towel-rack',
      'droplet', 'droplets', 'zap', 'flame', 'wind', 'thermometer',
      'wifi', 'phone', 'phone-call', 'monitor',
      'lightbulb', 'plug',
      'heart-pulse', 'stethoscope', 'pill', 'pill-bottle',
      'syringe', 'bandage', 'hospital',
      'scissors', 'hand', 'soap-dispenser-droplet',
    ],
  },
  clothing: {
    label: '服饰装扮',
    icons: ['shirt', 'hat-glasses', 'glasses', 'watch', 'handbag', 'footprints', 'gem', 'diamond', 'ribbon'],
  },
  entertainment: {
    label: '休闲娱乐',
    icons: [
      'gamepad', 'gamepad-2', 'joystick', 'ghost', 'puzzle',
      'dice-1', 'dice-2', 'dice-3', 'dice-4', 'dice-5', 'dice-6',
      'film', 'clapperboard', 'music', 'music-2', 'headphones',
      'guitar', 'drum', 'piano',
      'ticket', 'popcorn', 'party-popper',
      'dumbbell', 'volleyball', 'goal', 'target', 'trophy',
      'bike', 'mountain', 'mountain-snow', 'sun', 'sunrise', 'sunset',
      'camera', 'map', 'compass', 'tent', 'tent-tree',
      'backpack', 'luggage', 'palmtree',
      'book', 'book-open', 'graduation-cap', 'pencil',
      'paintbrush', 'palette',
    ],
  },
  social: {
    label: '人情社交',
    icons: [
      'gift', 'cake', 'party-popper',
      'heart', 'heart-handshake', 'hand-heart', 'handshake',
      'flower', 'flower-2', 'rose', 'clover',
      'crown', 'star', 'sparkles', 'medal', 'award',
      'badge-check', 'badge-plus', 'verified',
    ],
  },
  income: {
    label: '收入分类',
    icons: [
      'briefcase', 'briefcase-business', 'building-2', 'building',
      'trending-up', 'chart-line', 'percent',
      'gift', 'award', 'trophy', 'crown', 'star', 'sparkles',
      'hand-coins', 'circle-dollar-sign', 'dollar-sign', 'banknote', 'coins',
      'home', 'key', 'door-open',
      'laptop', 'smartphone', 'headphones', 'mic',
      'badge-check', 'verified',
      'user', 'users', 'user-round-check', 'id-card',
    ],
  },
  investment: {
    label: '投资理财',
    icons: [
      'trending-up', 'trending-down', 'trending-up-down',
      'chart-line', 'chart-bar', 'candlestick-chart',
      'area-chart', 'chart-pie', 'chart-no-axes-combined',
      'percent', 'circle-percent',
      'shield', 'shield-check', 'lock', 'vault',
      'file-check', 'file-text', 'file-signature', 'scroll-text',
      'briefcase', 'gem', 'diamond', 'coins',
      'circle-dollar-sign', 'dollar-sign', 'hand-coins',
      'banknote', 'banknote-arrow-up', 'banknote-arrow-down',
    ],
  },
  transfer: {
    label: '转账分类',
    icons: [
      'arrow-left-right', 'arrow-right-left',
      'arrow-up-down', 'arrow-up-right',
      'send', 'send-horizontal',
      'move', 'move-horizontal', 'move-vertical',
      'corner-up-right', 'corner-down-right',
      'repeat', 'repeat-2', 'refresh-cw', 'refresh-ccw',
      'git-compare', 'git-compare-arrows', 'git-merge',
      'git-branch', 'git-fork', 'git-pull-request-arrow',
      'replace', 'banknote-arrow-up', 'banknote-arrow-down',
      'link', 'external-link', 'unplug',
    ],
  },
} as const

const TAB_CONFIG = {
  account:  { label: '账户', keys: ['account'] },
  income:   { label: '收入', keys: ['income'] },
  expense:  { label: '支出', keys: ['food', 'transport', 'shopping', 'living', 'clothing', 'entertainment', 'social'] },
  transfer: { label: '转账', keys: ['investment', 'transfer'] },
} as const

const UNIQUE_ICONS = [...new Set(Object.values(ICON_CATEGORIES).flatMap(c => c.icons))]

/* ═══════════════════ ColorSwatchPicker ═══════════════════ */

const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({
  value,
  onChange,
  size = 22,
  allowClear = true,
  disabled = false,
}) => {
  const { isDark } = useTheme()
  const selected = value ?? null
  const [justSelected, setJustSelected] = useState<string | null>(null)

  const paletteMap = useMemo(() => {
    const map = {} as Record<AntDPresetColor, { bg: string; fg: string }>
    for (const name of ANTD_PRESET_COLORS) map[name] = getIconColorTokens(name, isDark)
    return map
  }, [isDark])

  const handleClick = useCallback((next: AntDPresetColor | null) => {
    if (disabled) return
    if (selected === next) {
      onChange?.(null)
      setJustSelected('__clear__')
      return
    }
    onChange?.(next)
    setJustSelected(next ?? '__clear__')
  }, [disabled, selected, onChange])

  const clearAnim = useCallback(() => setJustSelected(null), [])
  const dotSize = Math.round(size * 0.5)

  return (
    <div className={`color-swatch-picker${disabled ? ' is-disabled' : ''}`}>
      {allowClear && (
        <button
          type="button"
          className={`csp-clear${selected === null ? ' is-selected' : ''}${justSelected === '__clear__' ? ' is-just-selected' : ''}`}
          aria-label="不使用颜色"
          aria-pressed={selected === null}
          title="不使用颜色"
          onClick={() => handleClick(null)}
          onAnimationEnd={clearAnim}
          style={{ width: size, height: size }}
        >
          <span className="csp-clear__line" />
        </button>
      )}
      {ANTD_PRESET_COLORS.map((name) => {
        const isSelected = selected === name
        const tokens = paletteMap[name]
        return (
          <button
            key={name}
            type="button"
            className={`csp-swatch${isSelected ? ' is-selected' : ''}${justSelected === name ? ' is-just-selected' : ''}`}
            aria-label={name}
            aria-pressed={isSelected}
            title={name}
            onClick={() => handleClick(name)}
            onAnimationEnd={clearAnim}
            style={{ width: size, height: size, background: tokens.bg }}
          >
            <span aria-hidden className="csp-dot" style={{ width: dotSize, height: dotSize, background: tokens.fg }} />
            <span aria-hidden className="csp-check"><Check size={Math.max(10, Math.round(size * 0.45))} /></span>
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════ IconPicker ═══════════════════ */

const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  placeholder = '选择图标',
  color,
}) => {
  const { token } = theme.useToken()
  const searchRef = useRef<InputRef>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('account')
  const [justSelected, setJustSelected] = useState<string | null>(null)

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return UNIQUE_ICONS.filter(icon => icon.includes(q))
  }, [search])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) setTimeout(() => searchRef.current?.focus(), 50)
    else setSearch('')
  }, [])

  const handleSelect = (iconName: string) => {
    onChange?.(iconName)
    setJustSelected(iconName)
    setOpen(false)
    setSearch('')
  }

  const renderGrid = (icons: readonly string[], prefix: string) => (
    <div className="ip-grid">
      {icons.map(name => (
        <div
          key={`${prefix}-${name}`}
          className={`ip-cell${value === name ? ' is-selected' : ''}${justSelected === name ? ' is-just-selected' : ''}`}
          title={name}
          onClick={() => handleSelect(name)}
          onAnimationEnd={() => justSelected === name && setJustSelected(null)}
        >
          <DynamicIcon name={name} size={18} />
        </div>
      ))}
    </div>
  )

  const scrollArea = (children: React.ReactNode) => (
    <div className="ip-scroll-area">{children}</div>
  )

  const tabItems = ([
    { key: 'account', label: TAB_CONFIG.account.label, cats: [ICON_CATEGORIES.account] },
    { key: 'income', label: TAB_CONFIG.income.label, cats: [ICON_CATEGORIES.income] },
    { key: 'expense', label: TAB_CONFIG.expense.label, cats: null },
    { key: 'transfer', label: TAB_CONFIG.transfer.label, cats: null },
  ] as const).map(tab => {
    if (tab.key === 'expense') {
      return {
        key: tab.key,
        label: tab.label,
        children: scrollArea(
          TAB_CONFIG.expense.keys.map(catKey => {
            const cat = ICON_CATEGORIES[catKey as keyof typeof ICON_CATEGORIES]
            return cat ? (
              <div key={catKey} style={{ marginBottom: 12 }}>
                <div className="ip-subcategory-label">{cat.label}</div>
                {renderGrid(cat.icons, catKey)}
              </div>
            ) : null
          }),
        ),
      }
    }
    if (tab.key === 'transfer') {
      const merged = [...new Set([...ICON_CATEGORIES.investment.icons, ...ICON_CATEGORIES.transfer.icons])]
      return { key: tab.key, label: tab.label, children: scrollArea(renderGrid(merged, 'transfer')) }
    }
    const cats = tab.cats!
    return { key: tab.key, label: tab.label, children: scrollArea(renderGrid(cats[0].icons, tab.key)) }
  })

  const panelContent = (
    <div className="ip-panel">
      <div className="ip-search">
        <Input
          ref={searchRef}
          prefix={<Search size={14} style={{ color: token.colorTextTertiary }} />}
          placeholder="搜索图标..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          size="small"
        />
      </div>
      <div className="ip-content">
        {search.trim() ? (
          scrollArea(
            filteredIcons.length > 0
              ? renderGrid(filteredIcons, 'search')
              : <div style={{ padding: '32px 0', textAlign: 'center' }}><Empty description="未找到匹配图标" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>,
          )
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={(key) => { setActiveTab(key); setSearch('') }}
            items={tabItems}
            size="small"
          />
        )}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      content={panelContent}
      placement="bottomLeft"
      trigger="click"
      overlayClassName="ip-popover"
      overlayStyle={{ maxWidth: 360 }}
      overlayInnerStyle={{ padding: 0 }}
      arrow={false}
      destroyTooltipOnHide
    >
      <button
        type="button"
        className={`ip-trigger${value ? ' has-value' : ''}`}
        aria-label={value ? `当前图标：${value}，点击更换` : placeholder}
        aria-expanded={open}
        title={value || placeholder}
      >
        {value ? (
          <CategoryIcon name={value} color={color ?? null} size={36} iconSize={20} />
        ) : (
          <div className="ip-trigger__placeholder">
            <Plus size={18} style={{ color: token.colorTextTertiary }} />
            <span className="ip-trigger__placeholder-text">{placeholder}</span>
          </div>
        )}
      </button>
    </Popover>
  )
}

/* ═══════════════════ IconColorField ═══════════════════ */

const IconColorField: React.FC<IconColorFieldProps> = ({ form, allowClearColor = true }) => {
  const colorValue = Form.useWatch('color', form)
  return (
    <div className="icon-color-field">
      <Form.Item name="icon" noStyle>
        <IconPicker placeholder="选择图标" color={colorValue} />
      </Form.Item>
      <div className="icon-color-field__color-area">
        <Form.Item name="color" noStyle>
          <ColorSwatchPicker allowClear={allowClearColor} />
        </Form.Item>
      </div>
    </div>
  )
}

/* ═══════════════════ 导出 ═══════════════════ */

export default IconColorField