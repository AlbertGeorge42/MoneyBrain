/**
 * 抽屉外壳（Mantine Drawer）：把移动端底部升起 / 桌面端贴右、尺寸、portal 目标、
 * 关闭按钮与各业务族的 classNames 收在一处。业务页面只声明内容与动作区，不再各自复制
 * 十余行 Drawer 配置；视觉值、类名与层的顺序保持与原用法完全一致。
 *
 * 变体只描述「属于哪一族抽屉」，不承载业务逻辑：
 * - report：报表下钻 / 设置（mb-rp-sheet）
 * - transaction：流水详情 / 筛选 / 显示 / 批量（mb-tx-*）
 * - overview：总览交易详情（mb-shared-sheet + mb-overlay-*）
 * - entry：快速记账移动端底部表单（mb-ov-sheet）
 * - entryPicker：快速记账账户选择（桌面贴右，需挂到预览宿主）
 * - budget：预算详情 / 新增（mb-bg-detail / mb-bg-editor）
 * - settings：设置族编辑抽屉（mb-set-sheet，自定义头部、无默认关闭按钮）
 */
import { Drawer } from '@mantine/core'
import { useEffect, type ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import { registerOverlay } from './overlayPresence'

export type SheetVariant =
  | 'report'
  | 'transaction'
  | 'overview'
  | 'entry'
  | 'entryPicker'
  | 'budget'
  | 'settings'

interface SheetVariantConfig {
  contentMobile: string
  contentDesktop?: string
  header?: string
  title?: string
  bodyMobile: string
  bodyDesktop?: string
  inner?: string
  overlay?: string
  close?: string
  desktopSize?: number
  zIndex?: string | number
  withCloseButton: boolean
  actionsClassName?: string
}

const VARIANTS: Record<SheetVariant, SheetVariantConfig> = {
  report: {
    contentMobile: 'mb-rp-sheet',
    contentDesktop: 'mb-rp-sheet is-desktop',
    header: 'mb-rp-sheet-head',
    title: 'mb-rp-sheet-title',
    bodyMobile: 'mb-rp-sheet-body',
    overlay: 'mb-rp-overlay',
    close: 'mb-rp-sheet-close',
    desktopSize: 420,
    withCloseButton: true,
    actionsClassName: 'mb-rp-sheet-actions',
  },
  transaction: {
    contentMobile: 'mb-tx-sheet',
    contentDesktop: 'mb-tx-side',
    header: 'mb-tx-sheet-head',
    title: 'mb-tx-sheet-title',
    bodyMobile: 'mb-tx-sheet-body',
    overlay: 'mb-tx-overlay',
    close: 'mb-tx-sheet-close',
    withCloseButton: true,
    actionsClassName: 'mb-tx-filter-actions is-mobile',
  },
  overview: {
    contentMobile: 'mb-shared-sheet',
    header: 'mb-ov-overlay-head',
    title: 'mb-ov-title-wrap',
    bodyMobile: 'mb-ov-body',
    overlay: 'mb-ov-overlay',
    close: 'mb-ov-close',
    withCloseButton: true,
  },
  entry: {
    contentMobile: 'mb-shared-sheet mb-ov-sheet',
    header: 'mb-ov-overlay-head',
    title: 'mb-ov-title-wrap',
    bodyMobile: 'mb-ov-body',
    overlay: 'mb-ov-overlay',
    close: 'mb-ov-close',
    withCloseButton: true,
  },
  entryPicker: {
    contentMobile: 'mb-ov-picker-sheet',
    contentDesktop: 'mb-ov-picker-panel',
    header: 'mb-ov-overlay-head',
    title: 'mb-ov-title-wrap',
    bodyMobile: 'mb-ov-body',
    bodyDesktop: 'mb-ov-picker-body',
    overlay: 'mb-ov-overlay',
    close: 'mb-ov-close',
    desktopSize: 380,
    zIndex: 'var(--mb-z-sheet)',
    withCloseButton: true,
  },
  budget: {
    contentMobile: 'mb-shared-sheet',
    header: 'mb-ov-overlay-head',
    bodyMobile: 'mb-ov-body',
    overlay: 'mb-ov-overlay',
    desktopSize: 460,
    withCloseButton: true,
  },
  settings: {
    contentMobile: 'mb-set-sheet',
    contentDesktop: 'mb-set-sheet is-desktop',
    bodyMobile: 'mb-set-sheet-frame',
    inner: 'mb-set-sheet-inner',
    desktopSize: 380,
    withCloseButton: false,
  },
}

/**
 * 预览 / 生产壳的挂载点：移动挂手机框，桌面挂根容器；手机框尚未进 DOM 时退回根容器。
 * 与自研 DatePicker 的解析规则一致，避免同一抽屉在不同入口挂到 body 丢 token。
 */
function resolvePortalTarget(device: DeviceMode): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  const scope =
    device === 'mobile' ? document.querySelector<HTMLElement>('.mb-shell-phone') : null
  return scope ?? document.querySelector<HTMLElement>('.mb-shell-root') ?? undefined
}

function join(...parts: Array<string | undefined>): string | undefined {
  const merged = parts.filter(Boolean).join(' ')
  return merged || undefined
}

export function Sheet({
  variant,
  device,
  opened,
  onClose,
  title,
  titleClassName,
  children,
  actions,
  actionsClassName,
  contentClassName,
  bodyClassName,
  portal = false,
  zIndex,
  mobileSize = 'auto',
  desktopSize,
}: {
  variant: SheetVariant
  device: DeviceMode
  opened: boolean
  onClose: () => void
  title?: ReactNode
  /** 覆盖变体默认标题类（如同一 transaction 族里带副标题的用法）。 */
  titleClassName?: string
  children: ReactNode
  /** 常驻动作区；由变体决定容器类名，页面只传按钮。 */
  actions?: ReactNode
  actionsClassName?: string
  contentClassName?: string
  bodyClassName?: string
  /** 需要挂到预览壳 / 手机框时置 true（如记账账户选择、日期选择）。 */
  portal?: boolean
  zIndex?: string | number
  /** 移动端高度：默认按内容收缩；预算等全屏表单传 100%。 */
  mobileSize?: 'auto' | '100%'
  /** 桌面端宽度覆盖；同族两档（如设置 380/460）用显式数值，不复制变体。 */
  desktopSize?: number
}) {
  const config = VARIANTS[variant]
  const isMobile = device === 'mobile'
  // 桌面画布 .mb-shell-canvas 带 transform，会成为 position:fixed 的包含块；抽屉若留在
  // 画布内，fixed 相对画布而非视口——长页面滚动时抽屉跟着错位、底部被 overflow 裁切。
  // 桌面统一 portal 到无 transform 的 .mb-shell-root，让 fixed 真相对视口铺满；移动端仍
  // 留在手机框内（手机框自带 transform，由它约束 fixed 范围，符合底部抽屉设计）。
  const shouldPortal = portal || !isMobile
  const portalTarget = shouldPortal ? resolvePortalTarget(device) : undefined
  const actionClass = join(config.actionsClassName, actionsClassName)

  // 任意抽屉打开时登记，供 AppShell 的记一笔按钮订阅禁用（遮罩盖不住 portal 按钮）。
  useEffect(() => {
    if (!opened) return
    return registerOverlay()
  }, [opened])

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={isMobile ? 'bottom' : 'right'}
      {...(isMobile ? { size: mobileSize } : (desktopSize ?? config.desktopSize) !== undefined ? { size: desktopSize ?? config.desktopSize } : {})}
      withinPortal={shouldPortal}
      portalProps={portalTarget ? { target: portalTarget } : undefined}
      {...(zIndex !== undefined || config.zIndex !== undefined ? { zIndex: zIndex ?? config.zIndex } : {})}
      withCloseButton={config.withCloseButton}
      title={title}
      classNames={{
        content: join(isMobile ? config.contentMobile : config.contentDesktop ?? config.contentMobile, contentClassName),
        header: config.header,
        title: titleClassName ?? config.title,
        body: join(isMobile ? config.bodyMobile : config.bodyDesktop ?? config.bodyMobile, bodyClassName),
        inner: config.inner,
        overlay: config.overlay,
        close: config.close,
      }}
    >
      {children}
      {actions ? <div className={actionClass}>{actions}</div> : null}
    </Drawer>
  )
}
