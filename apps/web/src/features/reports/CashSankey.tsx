import { useMemo, useState, type KeyboardEvent } from 'react'
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
  labelTop: number
  labelBottom: number
  accountTop: number
  accountBottom: number
  minNodeH: number
  targetContent: number
  leftX: number
  midX: number
  rightX: number
  /** 移动端为 true 时不画账户的期初 / 期末读数。 */
  compactAccount: boolean
}

function layoutOf(device: DeviceMode): Layout {
  if (device === 'mobile') {
    const width = 360
    const nodeW = 10
    const leftX = 64
    const rightX = width - 64 - nodeW
    return {
      width,
      padTop: 22,
      padBottom: 16,
      nodeW,
      rowGap: 4,
      labelTop: 14,
      labelBottom: 2,
      accountTop: 4,
      accountBottom: 4,
      minNodeH: 4,
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
    labelTop: 18,
    labelBottom: 2,
    accountTop: 6,
    accountBottom: 30,
    minNodeH: 5,
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

function linkCountOf(node: CashSankeyNode, links: CashSankeyLink[], direction: 'in' | 'out'): number {
  const list =
    direction === 'in'
      ? links.filter((link) => link.targetId === node.id)
      : links.filter((link) => link.sourceId === node.id)
  return list.length
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
  // 稳定 layout 常量对象，否则下游 layout / 动画帧每次渲染都是新引用。
  const L = useMemo(() => layoutOf(device), [device])
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
  // 移动端每层分类节点聚合：收入层 / 支出层各保留前 keepTop 个，其余合并为「其他」。
  // PC 不传 keepTop，全量渲染。
  const keepTop = device === 'mobile' ? 4 : 0
  const layout = useMemo(() => {
    if (projected.status !== 'ready') return null

    // ── 每层节点聚合（仅 mobile；keepTop > 0 时生效） ──
    let nodes = projected.nodes
    let links = projected.links
    if (keepTop > 0) {
      const merged: CashSankeyNode[] = []
      for (const layer of [0, 2] as const) {
        const sorted = nodes
          .filter((n) => n.layer === layer)
          .sort((a, b) => b.amount - a.amount)
        if (sorted.length <= keepTop) {
          merged.push(...sorted)
          continue
        }
        const keep = sorted.slice(0, keepTop)
        const hide = sorted.slice(keepTop)
        merged.push(...keep)
        merged.push({
          ...hide[0], // 用第一个被合并节点的 tone 等属性，覆盖 id/name/amount
          id: `${layer === 0 ? 'in' : 'out'}:merged`,
          name: `其他 (${hide.length})`,
          layer,
          amount: hide.reduce((sum, n) => sum + n.amount, 0),
          children: [],
        })
      }
      merged.push(...nodes.filter((n) => n.layer === 1)) // 账户层全留
      // 重定向 links
      const redirect = new Map<string, string>()
      for (const layer of [0, 2] as const) {
        const sorted = nodes
          .filter((n) => n.layer === layer)
          .sort((a, b) => b.amount - a.amount)
        if (sorted.length > keepTop) {
          const mergedId = `${layer === 0 ? 'in' : 'out'}:merged`
          sorted.slice(keepTop).forEach((n) => redirect.set(n.id, mergedId))
        }
      }
      links = projected.links.map((link) => ({
        ...link,
        sourceId: redirect.get(link.sourceId) ?? link.sourceId,
        targetId: redirect.get(link.targetId) ?? link.targetId,
      }))
      nodes = merged
    }

    // 稳定排序：先按 origin（账户在前）、rank，再按组内 memberIndex。
    // 展开只在原组内展开，因此其他节点的相对顺序不受影响。
    const byStableOrder = (left: CashSankeyNode, right: CashSankeyNode) => {
      const originLeft = left.origin === 'account' ? 0 : 1
      const originRight = right.origin === 'account' ? 0 : 1
      if (originLeft !== originRight) return originLeft - originRight
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

    const heightOf = (node: CashSankeyNode): { h: number; row: number; top: number } => {
      const stacked =
        node.layer === 1
          ? Math.max(linkCountOf(node, links, 'in'), linkCountOf(node, links, 'out'))
          : node.layer === 0
            ? linkCountOf(node, links, 'out')
            : linkCountOf(node, links, 'in')
      const h = Math.max(L.minNodeH, node.amount * scale + 1.5 * stacked)
      return node.layer === 1
        ? { h, row: Math.max(h + L.accountTop + L.accountBottom, 44), top: L.accountTop }
        : { h, row: Math.max(h + L.labelTop + L.labelBottom, 34), top: L.labelTop }
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
        const metric = metrics.get(node.id) ?? { h: L.minNodeH, row: 34, top: L.labelTop }
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

    const laidLinks = links
      .slice()
      .sort((left, right) => right.amount - left.amount)
      .map((link) => {
        const source = placed.get(link.sourceId)
        const target = placed.get(link.targetId)
        if (!source || !target) return null
        const height = Math.max(1.5, link.amount * scale)
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
  }, [projected, L, keepTop])

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

  const transferHidden = data.transferTotal > 0 && !data.links.some((link) => link.kind === 'transfer')
  const mergedHidden = data.nodes.some((node) => node.id === 'in:hidden' || node.id === 'out:hidden')
  const hiddenNote =
    mergedHidden && data.hiddenGroups > 0 ? `已隐藏 ${data.hiddenGroups} 组，并入「其他」以保持守恒；` : ''
  const transferNote =
    data.transferTotal > 0
      ? transferHidden
        ? `账户间转账 ${currency(data.transferTotal)} 已并入「其他」。`
        : `账户间转账 ${currency(data.transferTotal)} 为内部转移，已画为账户间连线。`
      : ''

  return (
    <div className="mb-rp-sankey">
      <svg
        className="mb-rp-sankey-svg"
        viewBox={`0 0 ${L.width} ${viewHeight}`}
        role="img"
        aria-label={`现金流三层桑基图：收入分类 → ${data.accounts.length} 个账户 → 支出分类；流入 ${currency(data.inflow)}，流出 ${currency(data.outflow)}`}
      >
        <text className="mb-rp-sankey-axis" x={L.leftX - 10} y={18} textAnchor="end">
          收入分类
        </text>
        <text className="mb-rp-sankey-axis" x={L.midX + L.nodeW / 2} y={18} textAnchor="middle">
          账户
        </text>
        <text className="mb-rp-sankey-axis" x={L.rightX + L.nodeW + 10} y={18} textAnchor="start">
          支出分类
        </text>
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
                  y={gy - (L.compactAccount ? 6 : 9)}
                  textAnchor={node.anchor}
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
                  y={gy - (L.compactAccount ? 14 : 20)}
                  textAnchor={node.anchor}
                >
                  {node.name}
                </text>
                <text
                  className="mb-rp-sankey-value"
                  x={node.labelX}
                  y={gy - 6}
                  textAnchor={node.anchor}
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
      <div className="mb-rp-sankey-foot">
        <span>期初 {currency(data.opening)}</span>
        <span>+ 流入 {currency(data.inflow)}</span>
        <span>− 流出 {currency(data.outflow)}</span>
        <span>= 期末 {currency(data.closing)}</span>
        <span className="mb-rp-sankey-check" data-difference={data.difference}>
          差额 {currency(Math.abs(data.difference))}
        </span>
      </div>
      {(hiddenNote || transferNote) && (
        <p className="mb-rp-chart-note">
          {hiddenNote}
          {transferNote}
        </p>
      )}
    </div>
  )
}
