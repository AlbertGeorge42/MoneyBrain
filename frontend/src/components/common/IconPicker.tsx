import React, { useState, useMemo } from 'react'
import { Popover, Input, Tabs, Empty, theme } from 'antd'
import DynamicIcon from './DynamicIcon'

interface IconPickerProps {
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  size?: number
}

const ICON_CATEGORIES = {
  account: {
    label: '账户类型',
    icons: [
      // 钱包和现金
      'wallet', 'banknote', 'coins', 'piggy-bank', 'safe',
      // 银行和支付
      'landmark', 'building', 'building-2', 'credit-card', 'qr-code',
      // 电子支付
      'smartphone', 'laptop', 'monitor', 'tablet',
      // 投资账户
      'chart-line', 'chart-bar', 'trending-up', 'candlestick-chart',
      // 其他
      'briefcase', 'gem', 'package', 'box', 'archive',
    ],
  },
  income: {
    label: '收入分类',
    icons: [
      // 工资收入
      'briefcase', 'user', 'users', 'building-2', 'badge-check',
      // 奖金奖励
      'gift', 'award', 'trophy', 'crown', 'star', 'medal', 'sparkles',
      // 投资收益
      'trending-up', 'chart-line', 'chart-bar', 'candlestick-chart', 'percent',
      // 兼职副业
      'laptop', 'monitor', 'smartphone', 'headphones', 'mic',
      // 租金收入
      'home', 'building', 'key', 'door-open',
      // 其他收入
      'heart', 'hand-heart', 'coin', 'circle-dollar-sign', 'banknote',
    ],
  },
  expense: {
    label: '支出分类',
    icons: [
      // 餐饮
      'utensils', 'coffee', 'pizza', 'cake', 'ice-cream-cone', 'wine', 'beer', 'apple', 'egg', 'beef',
      // 交通
      'car', 'bus', 'bike', 'train', 'plane', 'taxi', 'ship', 'fuel', 'parking-circle',
      // 购物
      'shopping-cart', 'shopping-bag', 'shopping-basket', 'store', 'tag', 'percent', 'receipt',
      // 服饰
      'shirt', 'scissors', 'glasses', 'watch', 'footprints', 'hat-cowboy',
      // 居住
      'home', 'building', 'bed', 'sofa', 'lamp', 'lamp-ceiling', 'bath', 'toilet', 'key',
      // 水电燃气
      'droplet', 'zap', 'flame', 'thermometer', 'wind',
      // 通讯网络
      'smartphone', 'phone', 'wifi', 'monitor', 'tv',
      // 医疗健康
      'heart', 'heart-pulse', 'activity', 'stethoscope', 'pill', 'syringe', 'thermometer', 'ambulance',
      // 教育学习
      'book', 'book-open', 'graduation-cap', 'pencil', 'pen-tool', 'file-text', 'school', 'lightbulb',
      // 娱乐休闲
      'gamepad-2', 'film', 'music', 'tv', 'headphones', 'guitar', 'ticket', 'popcorn', 'party-popper',
      // 运动健身
      'dumbbell', 'bike', 'mountain', 'sun', 'waves', 'trophy', 'target', 'heart-pulse',
      // 旅行度假
      'plane', 'map', 'map-pin', 'compass', 'camera', 'suitcase', 'passport', 'tent', 'sunrise',
      // 宠物相关
      'dog', 'cat', 'fish', 'bird', 'paw-print',
      // 礼物人情
      'gift', 'party-popper', 'cake', 'heart', 'hand-heart', 'flower-2', 'rose',
      // 个人护理
      'scissors', 'sparkles', 'bath', 'droplet', 'hand',
      // 母婴儿童
      'baby', 'teddy-bear', 'toy-brick',
      // 办公用品
      'printer', 'paperclip', 'folder', 'file-text', 'pen-tool', 'calculator',
      // 维修保养
      'wrench', 'hammer', 'screwdriver', 'settings', 'tool',
      // 保险理财
      'shield', 'shield-check', 'lock', 'file-check', 'scroll-text',
      // 美容美发
      'scissors', 'sparkles', 'hand', 'heart',
      // 数码电子
      'smartphone', 'laptop', 'tablet', 'monitor', 'headphones', 'camera', 'watch',
      // 家居用品
      'sofa', 'lamp', 'bed', 'armchair', 'refrigerator', 'microwave', 'washing-machine',
    ],
  },
  transfer: {
    label: '转账分类',
    icons: [
      // 转账
      'arrow-left-right', 'arrow-right-left', 'send', 'arrow-up-right', 'arrow-down-left',
      // 循环
      'repeat', 'repeat-2', 'refresh-cw', 'refresh-ccw', 'rotate-ccw', 'rotate-cw',
      // 方向
      'move', 'corner-up-right', 'corner-down-left', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
      // 交换
      'git-compare', 'git-merge', 'git-branch', 'fork',
      // 其他
      'link', 'external-link', 'unplug', 'plug',
    ],
  },
}

const ALL_ICONS = Object.values(ICON_CATEGORIES).flatMap(cat => cat.icons)
const UNIQUE_ICONS = [...new Set(ALL_ICONS)]

const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  placeholder = '选择图标',
  size = 16,
}) => {
  const { token } = theme.useToken()
  const colorActionPrimary = token.colorPrimary
  const colorBorderSubtle = token.colorBorderSecondary
  const colorBorderInput = token.colorBorder
  const colorBgSurface = token.colorBgContainer
  const colorBgHover = token.controlItemBgHover || token.colorBgTextHover
  const colorBgSelected = token.controlItemBgActive || token.colorPrimaryBg
  const colorTextMuted = token.colorTextTertiary
  const spaceInlineDefault = `${token.paddingXS}px`
  const spaceCardPadding = `${token.padding}px`
  const radiusCard = `${token.borderRadius}px`
  const borderWidth = 'var(--mb-border-width)'
  const borderWidthThick = 'var(--mb-border-width-thick)'
  const borderStyle = 'var(--mb-border-style)'

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredIcons = useMemo(() => {
    if (!search) return UNIQUE_ICONS
    const lowerSearch = search.toLowerCase()
    return UNIQUE_ICONS.filter(icon => icon.includes(lowerSearch))
  }, [search])

  const handleSelect = (iconName: string) => {
    onChange?.(iconName)
    setOpen(false)
    setSearch('')
  }

  const renderIconGrid = (icons: string[], keyPrefix?: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: spaceInlineDefault }}>
      {icons.map(iconName => (
        <div
          key={keyPrefix ? `${keyPrefix}-${iconName}` : iconName}
          onClick={() => handleSelect(iconName)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            cursor: 'pointer',
            borderRadius: radiusCard,
            border: value === iconName ? `${borderWidthThick} ${borderStyle} ${colorActionPrimary}` : `${borderWidth} ${borderStyle} ${colorBorderSubtle}`,
            background: value === iconName ? colorBgSelected : colorBgSurface,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            if (value !== iconName) {
              e.currentTarget.style.background = colorBgHover
            }
          }}
          onMouseLeave={e => {
            if (value !== iconName) {
              e.currentTarget.style.background = colorBgSurface
            }
          }}
          title={iconName}
        >
          <DynamicIcon name={iconName} size={18} />
        </div>
      ))}
    </div>
  )

  const content = (
    <div style={{ width: 380 }}>
      <Input
        placeholder="搜索图标..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: spaceCardPadding }}
        allowClear
      />
      
      {search ? (
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          {filteredIcons.length > 0 ? (
            renderIconGrid(filteredIcons, 'search')
          ) : (
            <Empty description="未找到匹配图标" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      ) : (
        <Tabs
          defaultActiveKey="account"
          items={Object.entries(ICON_CATEGORIES).map(([key, cat]) => ({
            key,
            label: cat.label,
            children: (
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {renderIconGrid(cat.icons, key)}
              </div>
            ),
          }))}
          size="small"
        />
      )}
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={content}
      arrow={false}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: value ? 'center' : 'flex-start',
          gap: 4,
          padding: '4px 11px',
          border: `${borderWidth} ${borderStyle} ${colorBorderInput}`,
          borderRadius: radiusCard,
          cursor: 'pointer',
          minWidth: value ? 40 : 120,
          background: colorBgSurface,
        }}
      >
        {value ? (
          <DynamicIcon name={value} size={size} />
        ) : (
          <span style={{ color: colorTextMuted }}>{placeholder}</span>
        )}
      </div>
    </Popover>
  )
}

export default IconPicker
