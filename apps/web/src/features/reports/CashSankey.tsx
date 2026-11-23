import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import { currency } from './reportsModel'
import { projectCashSankey, type CashSankey, type CashSankeyLink, type CashSankeyNode } from './cashSankeyModel'
import { useAnimatedSankeyFrame, type SankeyFrame } from './useAnimatedSankeyFrame'

/**
 * 现金流桑基（渐进式三层）：收入分类/账户分类 → 现金账户分类 → 支出分类/账户分类。
 *
 * 初始每个一级分类 / 账户分类折叠成一个组节点；点击组节点展开其直接成员
 * （二级分类 / 账户），再点成员收起，不展开更深层级。展开是纯视图状态，
 * 由 projectCashSankey 投影，不改后端数据与守恒合计。
 *
 * 期初 / 期末不画成首尾节点，而是逐账户读数列在账户节点下方。
 * 高度由「每行节点 + 标签预留」算出；移动端保持三层但压缩常量、去掉账户读数。
 */
interface Layout {
  width: number
  padTop: number
  padBottom: number
  nodeW: number
  rowGap: number
  accountTop: number
  accountBottom: number
  /** 节点竖条与 ribbon 共用的最小可视高度，避免小流量细到看不见。 */
  minBandH: number
  /** 分类列两行文字（名称 + 金额）所需的最小行高。 */
  labelRow: number
  /** 账户列最小行高；移动端不画期初 / 期末读数，可比桌面端矮。 */
  accountRowMin: number
  targetContent: number
  leftX: number
  midX: number
  rightX: number
  /** 移动端为 true 时不画账户的期初 / 期末读数。 */
  compactAccount: boolean
}

function layoutOf(device: DeviceMode, measuredWidth?: number): Layout {
  if (device === 'mobile') {
    // viewBox 宽度取容器实测宽度，使 1 用户单位 = 1 CSS px：SVG 内 12px 文字
    // 渲染后仍是真正的 12px，与页面其它字号一致，不随容器宽度被放大 / 缩小。
    // 未测量到（SSR / 测试环境）时回落 360。
    const width = measuredWidth && measuredWidth > 0 ? measuredWidth : 360
    const nodeW = 10
    const leftX = 64
    const rightX = width - 64 - nodeW
    return {
      width,
      padTop: 16,
      padBottom: 12,
      nodeW,
      rowGap: 3,
      accountTop: 4,
      accountBottom: 4,
      minBandH: 4,
      labelRow: 24,
      accountRowMin: 28,
      targetContent: 220,
      leftX,
      midX: width / 2 - nodeW / 2,
      rightX,
      compactAccount: true,
    }
  }
  const width = 1080
  const nodeW = 14
  const leftX = 176
  const rightX = width - 176 - nodeW
  return {
    width,
    padTop: 26,
    padBottom: 20,
    nodeW,
    rowGap: 6,
    accountTop: 6,
    accountBottom: 30,
    minBandH: 5,
    labelRow: 32,
    accountRowMin: 44,
    targetContent: 260,
    leftX,
    midX: width / 2 - nodeW / 2,
    rightX,
    compactAccount: false,
  }
}

interface PlacedNode extends CashSankeyNode {
  x: number
  y: number
  h: number
  labelX: number
  anchor: 'start' | 'end' | 'middle'
}

/**
 * 活动色后缀：节点竖条与 ribbon 共用同一套语义，一条流从头到尾颜色连贯。
 * 账户列与无活动的流落 neutral；内部转账落 transfer。
 */
function toneOf(activity: CashSankeyLink['activity'], kind?: CashSankeyLink['kind']): string {
  if (kind === 'transfer') return 'transfer'
  switch (activity) {
    case 'operating': return 'operating'
    case 'investing': return 'investing'
    case 'financing': return 'financing'
    default: return 'neutral'
  }
}

function ribbonPath(x1: number, y1: number, x2: number, y2: number, height: number): string {
  const cx = x1 + (x2 - x1) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2} L ${x2} ${y2 + height} C ${cx} ${y2 + height}, ${cx} ${y1 + height}, ${x1} ${y1 + height} Z`
}

/** 账户之间的转账：同列内从右缘绕到目标右缘，绕行幅度避开账户读数文字。 */
function transferPath(x1: number, y1: number, x2: number, y2: number, height: number): string {
  const bend = 180
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 + bend} ${y2}, ${x2} ${y2} L ${x2} ${y2 + height} C ${x2 + bend} ${y2 + height}, ${x1 + bend} ${y1 + height}, ${x1} ${y1 + height} Z`
}

export function CashSankeyChart({
  data,
  device,
  animate = true,
}: {
  data: CashSankey
  device: DeviceMode
  /** 测试或 reduced-motion 场景可关闭；关闭时几何直接跳到终态。 */
  animate?: boolean
}) {
  // 移动端实测容器宽度：让 viewBox 宽度 = CSS 宽度，SVG 内文字按真实 px 渲染，
  // 不随容器缩放。ResizeObserver 缺失（SSR / 测试）时 layoutOf 回落 360。
  const wrapRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  useEffect(() => {
    if (device !== 'mobile' || typeof ResizeObserver === 'undefined') return
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const width = el.clientWidth
      if (width > 0) setMeasuredWidth(width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [device])
  // 稳定 layout 常量对象，否则下游 layout / 动画帧每次渲染都是新引用。
  const L = useMemo(() => layoutOf(device, measuredWidth), [device, measuredWidth])
  // 渐进式：按展开集合把细节点投影成组节点或成员节点。展开状态是纯视图状态，
  // 不改后端数据与守恒合计；切换设备 / 区间时数据变化不影响展开集合本身。
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>())
  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const projected = useMemo(() => projectCashSankey(data, expanded), [data, expanded])
  // 移动端按活动分类独立聚合：每个活动保留前 perActivityTop 个组，该活动超出的
  // 组聚合成带活动色的「其他」。不再全层限 4 个，三类活动各有自己的容量与聚合位。
  // PC 不聚合，全量渲染。
  const perActivityTop = device === 'mobile' ? 3 : 0
  const layout = useMemo(() => {
    if (projected.status !== 'ready') return null

    type Activity = CashSankeyLink['activity']
    type Unit = { key: string; amount: number; activity: Activity; rank: number }
    const activityRank = (a: Activity): number =>
      a === 'operating' ? 0 : a === 'investing' ? 1 : a === 'financing' ? 2 : 3

    // ── 每层按活动聚合（仅 mobile；perActivityTop > 0 时生效） ──
    // 聚合基准是稳定的「分组 + 活动」，从细图 data 汇总，与 expanded 无关：组的金额
    // 与活动在展开前后都不变，keep / 其他归属恒定，展开只在 keep 组内原位展开，
    // 不会让其他节点重排，也不会重算「其他」的成员、金额与名称。
    let nodes = projected.nodes
    let links = projected.links
    if (perActivityTop > 0) {
      const merged: CashSankeyNode[] = []
      const redirect = new Map<string, string>()
      for (const layer of [0, 2] as const) {
        const prefix = layer === 0 ? 'in' : 'out'
        // unit = 一个分组（groupId）；组内活动不统一则退 null（同 finalizeGroups 口径）。
        // self: 独立节点各自成一个 unit。从细图 data 汇总，与 expanded 无关。
        const units = new Map<string, Unit>()
        for (const node of data.nodes) {
          if (node.layer !== layer) continue
          const key = node.groupId ?? `self:${node.id}`
          const current = units.get(key)
          if (current) {
            current.amount += node.amount
            if (current.activity !== (node.activity ?? null)) current.activity = null
          } else {
            units.set(key, { key, amount: node.amount, activity: node.activity ?? null, rank: node.rank ?? 0 })
          }
        }
        // 按活动分桶，桶内按金额排序；每桶保留 top N，超出的合并为该活动的「其他」。
        const buckets = new Map<Activity, Unit[]>()
        for (const unit of units.values()) {
          const list = buckets.get(unit.activity) ?? []
          list.push(unit)
          buckets.set(unit.activity, list)
        }
        const keepKeys = new Set<string>()
        const hidden: Array<{ activity: Activity; keys: string[]; amount: number; count: number }> = []
        for (const [activity, list] of buckets) {
          list.sort((a, b) => b.amount - a.amount || a.rank - b.rank || a.key.localeCompare(b.key))
          list.slice(0, perActivityTop).forEach((unit) => keepKeys.add(unit.key))
          const tail = list.slice(perActivityTop)
          if (tail.length > 0) {
            hidden.push({
              activity,
              keys: tail.map((unit) => unit.key),
              amount: tail.reduce((sum, unit) => sum + unit.amount, 0),
              count: tail.length,
            })
          }
        }
        // keep 节点原样保留；hide 节点按所属活动重定向到对应的「其他」。
        for (const node of projected.nodes) {
          if (node.layer !== layer) continue
          const key = node.groupId ?? `self:${node.id}`
          if (keepKeys.has(key)) {
            merged.push(node)
            continue
          }
          const bucket = hidden.find((item) => item.keys.includes(key))
          if (bucket) redirect.set(node.id, `${prefix}:merged:${bucket.activity ?? 'neutral'}`)
        }
        // 每个活动一个「其他」：带该活动色，与汇入 ribbon 同色；不可点击、沉底。
        for (const item of hidden) {
          merged.push({
            id: `${prefix}:merged:${item.activity ?? 'neutral'}`,
            name: `其他 (${item.count})`,
            layer,
            tone: layer === 0 ? 'income' : 'expense',
            amount: item.amount,
            children: [],
            isGroup: false,
            expandable: false,
            rank: Number.MAX_SAFE_INTEGER - 10 + activityRank(item.activity),
            memberIndex: 0,
            activity: item.activity,
          })
        }
      }
      merged.push(...projected.nodes.filter((node) => node.layer === 1)) // 账户层全留
      links = projected.links.map((link) => ({
        ...link,
        sourceId: redirect.get(link.sourceId) ?? link.sourceId,
        targetId: redirect.get(link.targetId) ?? link.targetId,
      }))
      nodes = merged
    }

    // 顺序完全由折叠态确定的 rank / memberIndex 决定：活动类型 → 账户/分类 → 金额
    // 已在 finalizeGroups 编码进 rank，展开只在原组内展开，因此视图层不再重排，
    // 保证任意展开组合下节点整体顺序不变，同色 ribbon 始终相邻。
    const byStableOrder = (left: CashSankeyNode, right: CashSankeyNode) => {
      if ((left.rank ?? 0) !== (right.rank ?? 0)) return (left.rank ?? 0) - (right.rank ?? 0)
      if ((left.memberIndex ?? 0) !== (right.memberIndex ?? 0)) return (left.memberIndex ?? 0) - (right.memberIndex ?? 0)
      return right.amount - left.amount
    }
    const income = nodes.filter((node) => node.layer === 0).sort(byStableOrder)
    const accounts = nodes.filter((node) => node.layer === 1).sort(byStableOrder)
    const expense = nodes.filter((node) => node.layer === 2).sort(byStableOrder)
    if (income.length === 0 && accounts.length === 0 && expense.length === 0) return null

    const maxColumnAmount = Math.max(
      income.reduce((sum, node) => sum + node.amount, 0),
      expense.reduce((sum, node) => sum + node.amount, 0),
      accounts.reduce((sum, node) => sum + node.amount, 0),
      1,
    )
    // 同一比例尺贯穿三列，ribbon 粗细与节点高度可比；列内容超出目标高度时图变高而不是压缩标签。
    const scale = L.targetContent / maxColumnAmount

    // ribbon 与节点竖条共用同一最小高度；节点高度由实际挂着的 ribbon 堆叠算出，
    // 保证小流量被抬到最小值后，整叠 ribbon 仍落在竖条内而不溢出。
    const bandGap = 1.5
    const bandHeightOf = (link: CashSankeyLink): number => Math.max(L.minBandH, link.amount * scale)
    const stackHeightOf = (node: CashSankeyNode, direction: 'in' | 'out'): number => {
      const attached = links.filter((link) =>
        direction === 'in' ? link.targetId === node.id : link.sourceId === node.id)
      if (attached.length === 0) return 0
      return attached.reduce((sum, link) => sum + bandHeightOf(link), 0) + (attached.length - 1) * bandGap
    }
    const heightOf = (node: CashSankeyNode): { h: number; row: number; top: number } => {
      // 节点条高度严格等于挂着的 ribbon 堆叠高度，与 ribbon 共用同一最小高度，
      // 因此小流量节点条与它自己的条带一样细，不会被文字撑粗。
      const bandStack = node.layer === 1
        ? Math.max(stackHeightOf(node, 'in'), stackHeightOf(node, 'out'))
        : stackHeightOf(node, node.layer === 0 ? 'out' : 'in')
      const h = Math.max(L.minBandH, bandStack)
      if (node.layer === 1) {
        // 账户行：桌面端另有下方余额读数，移动端不画读数故下限更矮。
        return { h, row: Math.max(h + L.accountTop + L.accountBottom, L.accountRowMin), top: L.accountTop }
      }
      // 分类列两行文字（名称 + 金额）所需空间由**行高**单独承担，节点条在行内
      // 垂直居中；这样文字彼此不重叠，又不反过来把节点条撑大。
      const row = Math.max(h, L.labelRow)
      return { h, row, top: (row - h) / 2 }
    }

    const metrics = new Map<string, { h: number; row: number; top: number }>(
      nodes.map((node) => [node.id, heightOf(node)]),
    )

    const placeColumn = (
      nodes: CashSankeyNode[],
      x: number,
      labelX: number,
      anchor: 'start' | 'end' | 'middle',
      columnHeight: number,
    ): PlacedNode[] => {
      const rows = nodes.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0)
      const gaps = Math.max(0, nodes.length - 1) * L.rowGap
      const total = rows + gaps
      let cursor = L.padTop + Math.max(0, (columnHeight - total) / 2)
      const placed: PlacedNode[] = []
      for (const node of nodes) {
        const metric = metrics.get(node.id) ?? { h: L.minBandH, row: 34, top: 0 }
        placed.push({
          ...node,
          x,
          y: cursor + metric.top,
          h: metric.h,
          labelX,
          anchor,
        })
        cursor += metric.row + L.rowGap
      }
      return placed
    }

    const columnTotals = [
      income.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0) +
        Math.max(0, income.length - 1) * L.rowGap,
      accounts.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 44), 0) +
        Math.max(0, accounts.length - 1) * L.rowGap,
      expense.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0) +
        Math.max(0, expense.length - 1) * L.rowGap,
    ]
    const columnHeight = Math.max(...columnTotals, 1)

    const placed = new Map<string, PlacedNode>()
    const put = (list: PlacedNode[]) => {
      for (const node of list) placed.set(node.id, node)
    }
    put(placeColumn(income, L.leftX, L.leftX - 10, 'end', columnHeight))
    put(placeColumn(accounts, L.midX, L.midX - 10, 'end', columnHeight))
    put(placeColumn(expense, L.rightX, L.rightX + L.nodeW + 10, 'start', columnHeight))

    const outCursors = new Map<string, number>()
    const inCursors = new Map<string, number>()
    for (const node of placed.values()) {
      outCursors.set(node.id, node.y)
      inCursors.set(node.id, node.y)
    }

    // ribbon 在节点上的堆叠顺序必须跟随「外列」端点的纵向位置，否则节点虽已按活动
    // 排好序，条带仍会交叉：左→中按左列源节点顺序，中→右按右列目标节点顺序，
    // 转账两端都在中列时按目标顺序。金额只作为同外列端点下的次级键。
    const outerYOf = (link: CashSankeyLink): number => {
      const source = placed.get(link.sourceId)
      const target = placed.get(link.targetId)
      const outer = source?.layer === 1 ? target : source
      return outer?.y ?? 0
    }
    const laidLinks = links
      .slice()
      .sort((left, right) => {
        const a = outerYOf(left)
        const b = outerYOf(right)
        if (a !== b) return a - b
        if (left.amount !== right.amount) return right.amount - left.amount
        return left.id.localeCompare(right.id)
      })
      .map((link) => {
        const source = placed.get(link.sourceId)
        const target = placed.get(link.targetId)
        if (!source || !target) return null
        const height = bandHeightOf(link)
        const y1 = outCursors.get(link.sourceId) ?? source.y
        outCursors.set(link.sourceId, y1 + height)
        const y2 = inCursors.get(link.targetId) ?? target.y
        inCursors.set(link.targetId, y2 + height)
        // 端点与 x：x 由三列固定不参与插值，y1/y2/height 交给动画帧逐帧覆盖后重建 path。
        const x1 = source.x + L.nodeW
        const x2 = link.kind === 'transfer' ? target.x + L.nodeW : target.x
        return { link, x1, x2, y1, y2, height, transfer: link.kind === 'transfer' }
      })
      .filter(
        (
          item,
        ): item is {
          link: CashSankeyLink
          x1: number
          x2: number
          y1: number
          y2: number
          height: number
          transfer: boolean
        } => item !== null,
      )

    const height = L.padTop + columnHeight + L.padBottom
    return { placed: [...placed.values()], links: laidLinks, height }
  }, [projected, data, L, perActivityTop])

  // 目标几何快照：每帧自带展示数据，退出元素在动画期间仍可渲染。
  // 节点带 groupId / isGroup 供 hook 做组↔成员桥接（散开 / 聚拢）。
  const targetFrame = useMemo<SankeyFrame | null>(() => {
    if (!layout) return null
    return {
      nodes: new Map(
        layout.placed.map((node) => [
          node.id,
          {
            id: node.id,
            groupId: node.groupId,
            isGroup: node.isGroup === true,
            x: node.x,
            y: node.y,
            h: node.h,
            opacity: 1,
            render: node,
          },
        ]),
      ),
      links: new Map(
        layout.links.map((item) => [
          item.link.id,
          {
            id: item.link.id,
            x1: item.x1,
            x2: item.x2,
            y1: item.y1,
            y2: item.y2,
            height: item.height,
            opacity: 1,
            transfer: item.transfer,
            render: item,
          },
        ]),
      ),
      height: layout.height,
    }
  }, [layout])
  const frame = useAnimatedSankeyFrame(targetFrame, animate)

  if (data.status !== 'ready' || !layout) {
    return (
      <div className="mb-rp-sankey-fail" role="status">
        {data.reason ?? '现金流分组合计与对账总额不一致，桑基已停画。'}
      </div>
    )
  }

  const viewHeight = frame?.height ?? layout.height

  // 动画帧自带展示数据（含退出中的元素）；无动画 / 未就绪时回落到 layout 的终态元素。
  // 退出元素（opacity 递减中）不响应点击，避免形变过程中误触。
  type RenderNode = { node: PlacedNode; y: number; h: number; opacity: number; exiting: boolean }
  type RenderLink = {
    item: (typeof layout.links)[number]
    y1: number
    y2: number
    height: number
    opacity: number
  }
  const renderNodes: RenderNode[] = frame
    ? [...frame.nodes.values()].map((fn) => ({
        node: fn.render as PlacedNode,
        y: fn.y,
        h: fn.h,
        opacity: fn.opacity,
        exiting: !layout.placed.some((node) => node.id === fn.id),
      }))
    : layout.placed.map((node) => ({ node, y: node.y, h: node.h, opacity: 1, exiting: false }))
  const renderLinks: RenderLink[] = frame
    ? [...frame.links.values()].map((fl) => ({
        item: fl.render as (typeof layout.links)[number],
        y1: fl.y1,
        y2: fl.y2,
        height: fl.height,
        opacity: fl.opacity,
      }))
    : layout.links.map((item) => ({ item, y1: item.y1, y2: item.y2, height: item.height, opacity: 1 }))

  return (
    <div className="mb-rp-sankey" ref={wrapRef}>
      <svg
        className="mb-rp-sankey-svg"
        data-device={device}
        viewBox={`0 0 ${L.width} ${viewHeight}`}
        role="img"
        aria-label={`现金流三层桑基图：收入分类 → ${data.accounts.length} 个账户 → 支出分类；流入 ${currency(data.inflow)}，流出 ${currency(data.outflow)}`}
      >
        {/* 小流量（手续费 / 修正）后画：叠在粗 ribbon 之上。 */}
        {renderLinks.map(({ item, y1, y2, height, opacity }) => {
          const d = item.transfer
            ? transferPath(item.x1, y1, item.x2, y2, height)
            : ribbonPath(item.x1, y1, item.x2, y2, height)
          return (
            <g
              key={item.link.id}
              className={`mb-rp-sankey-link mb-rp-sankey-tone--${toneOf(item.link.activity, item.link.kind)}`}
              data-kind={item.link.kind}
              opacity={opacity}
            >
              <path className="mb-rp-sankey-ribbon" d={d} />
            </g>
          )
        })}
        {renderNodes.map(({ node, y: gy, h: gh, opacity: nodeOpacity, exiting }) => {
          const canToggle = !exiting && node.expandable === true && !!node.groupId
          const isOpen = canToggle && node.isGroup !== true
          const handleToggle = (fromPointer: boolean) => {
            if (!canToggle) return
            // 鼠标点击后主动失焦，避免 UA 在 <g tabindex> 上留下焦点框；
            // 键盘触发保留焦点，维持键盘用户的可访问性。
            if (fromPointer && typeof document !== 'undefined' && document.activeElement instanceof SVGElement) {
              document.activeElement.blur()
            }
            toggleGroup(node.groupId!)
          }
          return (
          <g
            key={node.id}
            className={`mb-rp-sankey-node mb-rp-sankey-tone--${node.layer === 1 ? 'neutral' : toneOf(node.activity ?? null)}${canToggle ? ' mb-rp-sankey-node--expandable' : ''}${isOpen ? ' mb-rp-sankey-node--open' : ''}`}
            data-id={node.id}
            data-layer={node.layer}
            data-amount={node.amount}
            opacity={nodeOpacity}
            {...(canToggle
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  'aria-expanded': isOpen,
                  'aria-label': `${isOpen ? '收起' : '展开'}${node.groupName ?? node.name}`,
                  onClick: () => handleToggle(true),
                  onKeyDown: (event: KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleToggle(false)
                    }
                  },
                }
              : {})}
          >
            <rect className="mb-rp-sankey-node-body" x={node.x} y={gy} width={L.nodeW} height={Math.max(0, gh)} rx={3} />
            {canToggle && (
              <rect
                className="mb-rp-sankey-node-hit"
                x={node.x - 6}
                y={gy}
                width={L.nodeW + 12}
                height={Math.max(0, gh)}
                rx={3}
              />
            )}
            {node.layer === 1 ? (
              <>
                <text
                  className="mb-rp-sankey-name"
                  x={node.labelX}
                  y={gy + gh / 2 + (L.compactAccount ? 3 : 4)}
                  textAnchor={node.anchor}
                  dominantBaseline="middle"
                >
                  {node.name}
                </text>
                {!L.compactAccount && node.account && (
                  <text
                    className="mb-rp-sankey-balance"
                    x={node.labelX}
                    y={gy + gh + 17}
                    textAnchor={node.anchor}
                  >
                    期初 {currency(node.account.opening)} → 期末 {currency(node.account.closing)}
                  </text>
                )}
              </>
            ) : (
              <>
                <text
                  className="mb-rp-sankey-name"
                  x={node.labelX}
                  y={gy + gh / 2 - 7}
                  textAnchor={node.anchor}
                  dominantBaseline="middle"
                >
                  {node.name}
                </text>
                <text
                  className="mb-rp-sankey-value"
                  x={node.labelX}
                  y={gy + gh / 2 + 8}
                  textAnchor={node.anchor}
                  dominantBaseline="middle"
                >
                  {currency(node.amount)}
                </text>
              </>
            )}
          </g>
          )
        })}
      </svg>
      <div className="mb-rp-sankey-legend" aria-label="现金流活动图例">
        <span className="mb-rp-sankey-legend-item" data-activity="operating">经营</span>
        <span className="mb-rp-sankey-legend-item" data-activity="investing">投资</span>
        <span className="mb-rp-sankey-legend-item" data-activity="financing">筹资</span>
        <span className="mb-rp-sankey-legend-item" data-activity="neutral">其他</span>
      </div>
    </div>
  )
}
