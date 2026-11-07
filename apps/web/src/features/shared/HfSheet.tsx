/**
 * 抽屉外壳（Mantine Drawer）：把移动端底部升起 / 桌面端贴右、尺寸、portal 目标、
 * 关闭按钮与各业务族的 classNames 收在一处。业务页面只声明内容与动作区，不再各自复制
 * 十余行 Drawer 配置；视觉值、类名与层的顺序保持与原用法完全一致。
 *
 * 变体只描述「属于哪一族抽屉」，不承载业务逻辑：
 * - report：报表下钻 / 设置（mb-rp-sheet）
 * - transaction：流水详情 / 筛选 / 显示 / 批量（mb-tx-*）
 * - overview：总览交易详情（mb-sheet + mb-overlay-*）
 * - entry：快速记账移动端底部表单（mb-entry-sheet）
 * - entryPicker：快速记账账户选择（桌面贴右，需挂到预览宿主）
 * - budget：预算详情 / 新增（mb-bg-detail / mb-bg-editor）
 * - settings：设置族编辑抽屉（mb-set-sheet，自定义头部、无默认关闭按钮）
 */
import { Drawer } from '@mantine/core'
import type { ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'

export type HfSheetVariant =
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
  zIndex?: number
  withCloseButton: boolean
  actionsClassName?: string
}

const VARIANTS: Record<HfSheetVariant, SheetVariantConfig> = {
  report: {
    contentMobile: 'mb-rp-sheet',
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
    contentMobile: 'mb-sheet',
    header: 'mb-overlay-head',
    title: 'mb-overlay-title-wrap',
    bodyMobile: 'mb-overlay-body',
    overlay: 'mb-overlay',
    close: 'mb-overlay-close',
    withCloseButton: true,
  },
  entry: {
    contentMobile: 'mb-sheet mb-entry-sheet',
    header: 'mb-overlay-head',
    title: 'mb-overlay-title-wrap',
    bodyMobile: 'mb-overlay-body',
    overlay: 'mb-overlay',
    close: 'mb-overlay-close',
    withCloseButton: true,
  },
  entryPicker: {
    contentMobile: 'mb-entry-picker-sheet',
    contentDesktop: 'mb-entry-picker-panel',
    header: 'mb-overlay-head',
    title: 'mb-overlay-title-wrap',
    bodyMobile: 'mb-overlay-body',
    bodyDesktop: 'mb-entry-picker-body',
    overlay: 'mb-overlay',
    close: 'mb-overlay-close',
    desktopSize: 380,
    zIndex: 300,
    withCloseButton: true,
  },
  budget: {
    contentMobile: 'mb-sheet',
    header: 'mb-overlay-head',
    bodyMobile: 'mb-overlay-body',
    overlay: 'mb-overlay',
    desktopSize: 460,
    withCloseButton: true,
  },
  settings: {
    contentMobile: 'mb-set-sheet',
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
    device === 'mobile' ? document.querySelector<HTMLElement>('.mb-hf-phone') : null
  return scope ?? document.querySelector<HTMLElement>('.mb-hf-root') ?? undefined
}

function join(...parts: Array<string | undefined>): string | undefined {
  const merged = parts.filter(Boolean).join(' ')
  return merged || undefined
}

export function HfSheet({
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
}: {
  variant: HfSheetVariant
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
  zIndex?: number
  /** 移动端高度：默认按内容收缩；预算等全屏表单传 100%。 */
  mobileSize?: 'auto' | '100%'
}) {
  const config = VARIANTS[variant]
  const isMobile = device === 'mobile'
  const portalTarget = portal ? resolvePortalTarget(device) : undefined
  const actionClass = join(config.actionsClassName, actionsClassName)

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={isMobile ? 'bottom' : 'right'}
      {...(isMobile ? { size: mobileSize } : config.desktopSize !== undefined ? { size: config.desktopSize } : {})}
      withinPortal={portal}
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
