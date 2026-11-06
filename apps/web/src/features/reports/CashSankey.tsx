import { useMemo } from 'react'
import { currency } from './reportsModel'
import type { CashSankey, CashSankeyLink, CashSankeyNode } from './cashSankeyModel'

/**
 * PC 现金流桑基（三层）：收入一级分类 → 账户 → 支出一级分类。
 *
 * 期初 / 期末不画成首尾节点，而是逐账户读数列在账户节点下方。
 * 高度由「每行节点 + 标签预留」算出：分类名 / 金额两行、账户名 + 期初期末两行
 * 都占在自己的行带里，节点再密也不会压字。
 */
const WIDTH = 1080
const PAD_TOP = 34
const PAD_BOTTOM = 26
const NODE_W = 14
const ROW_GAP = 12
const HIT = 24
const LABEL_TOP = 24
const LABEL_BOTTOM = 2
const ACCOUNT_TOP = 10
const ACCOUNT_BOTTOM = 40
const MIN_NODE_H = 6
const TARGET_CONTENT = 420

const LEFT_X = 176
const MID_X = WIDTH / 2 - NODE_W / 2
const RIGHT_X = WIDTH - 176 - NODE_W

interface PlacedNode extends CashSankeyNode {
  x: number
  y: number
  h: number
  labelX: number
  anchor: 'start' | 'end' | 'middle'
}

function toneClass(tone: CashSankeyNode['tone']) {
  return tone === 'income' ? 'is-inflow' : tone === 'expense' ? 'is-outflow' : 'is-neutral'
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
  onOpen,
}: {
  data: CashSankey
  onOpen: (nodeId: string, amount: number) => void
}) {
  const layout = useMemo(() => {
    if (data.status !== 'ready') return null
    const income = data.nodes.filter((node) => node.layer === 0).sort((left, right) => right.amount - left.amount)
    const accounts = data.nodes.filter((node) => node.layer === 1).sort((left, right) => right.amount - left.amount)
    const expense = data.nodes.filter((node) => node.layer === 2).sort((left, right) => right.amount - left.amount)
    if (income.length === 0 && accounts.length === 0 && expense.length === 0) return null

    const maxColumnAmount = Math.max(
      income.reduce((sum, node) => sum + node.amount, 0),
      expense.reduce((sum, node) => sum + node.amount, 0),
      accounts.reduce((sum, node) => sum + node.amount, 0),
      1,
    )
    // 同一比例尺贯穿三列，ribbon 粗细与节点高度可比；列内容超出目标高度时图变高而不是压缩标签。
    const scale = TARGET_CONTENT / maxColumnAmount

    const heightOf = (node: CashSankeyNode): { h: number; row: number; top: number } => {
      const stacked =
        node.layer === 1
          ? Math.max(linkCountOf(node, data.links, 'in'), linkCountOf(node, data.links, 'out'))
          : node.layer === 0
            ? linkCountOf(node, data.links, 'out')
            : linkCountOf(node, data.links, 'in')
      const h = Math.max(MIN_NODE_H, node.amount * scale + 1.5 * stacked)
      return node.layer === 1
        ? { h, row: Math.max(h + ACCOUNT_TOP + ACCOUNT_BOTTOM, 44), top: ACCOUNT_TOP }
        : { h, row: Math.max(h + LABEL_TOP + LABEL_BOTTOM, 34), top: LABEL_TOP }
    }

    const metrics = new Map<string, { h: number; row: number; top: number }>(
      data.nodes.map((node) => [node.id, heightOf(node)]),
    )

    const placeColumn = (
      nodes: CashSankeyNode[],
      x: number,
      labelX: number,
      anchor: 'start' | 'end' | 'middle',
      columnHeight: number,
    ): PlacedNode[] => {
      const rows = nodes.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0)
      const gaps = Math.max(0, nodes.length - 1) * ROW_GAP
      const total = rows + gaps
      let cursor = PAD_TOP + Math.max(0, (columnHeight - total) / 2)
      const placed: PlacedNode[] = []
      for (const node of nodes) {
        const metric = metrics.get(node.id) ?? { h: MIN_NODE_H, row: 34, top: LABEL_TOP }
        placed.push({
          ...node,
          x,
          y: cursor + metric.top,
          h: metric.h,
          labelX,
          anchor,
        })
        cursor += metric.row + ROW_GAP
      }
      return placed
    }

    const columnTotals = [
      income.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0) +
        Math.max(0, income.length - 1) * ROW_GAP,
      accounts.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 44), 0) +
        Math.max(0, accounts.length - 1) * ROW_GAP,
      expense.reduce((sum, node) => sum + (metrics.get(node.id)?.row ?? 34), 0) +
        Math.max(0, expense.length - 1) * ROW_GAP,
    ]
    const columnHeight = Math.max(...columnTotals, 1)

    const placed = new Map<string, PlacedNode>()
    const put = (list: PlacedNode[]) => {
      for (const node of list) placed.set(node.id, node)
    }
    put(placeColumn(income, LEFT_X, LEFT_X - 10, 'end', columnHeight))
    put(placeColumn(accounts, MID_X, MID_X - 10, 'end', columnHeight))
    put(placeColumn(expense, RIGHT_X, RIGHT_X + NODE_W + 10, 'start', columnHeight))

    const outCursors = new Map<string, number>()
    const inCursors = new Map<string, number>()
    for (const node of placed.values()) {
      outCursors.set(node.id, node.y)
      inCursors.set(node.id, node.y)
    }

    const links = data.links
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
        if (link.kind === 'transfer') {
          return {
            link,
            d: transferPath(source.x + NODE_W, y1, target.x + NODE_W, y2, height),
            height,
          }
        }
        const x1 = source.x + NODE_W
        const x2 = target.x
        return { link, d: ribbonPath(x1, y1, x2, y2, height), height }
      })
      .filter((item): item is { link: CashSankeyLink; d: string; height: number } => item !== null)

    const height = PAD_TOP + columnHeight + PAD_BOTTOM
    return { placed: [...placed.values()], links, height }
  }, [data])

  if (data.status !== 'ready' || !layout) {
    return (
      <div className="mb-rp-sankey-fail" role="status">
        {data.reason ?? '现金流分组合计与对账总额不一致，桑基已停画。'}
      </div>
    )
  }

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
        viewBox={`0 0 ${WIDTH} ${layout.height}`}
        role="img"
        aria-label={`现金流三层桑基图：收入分类 → ${data.accounts.length} 个账户 → 支出分类；流入 ${currency(data.inflow)}，流出 ${currency(data.outflow)}`}
      >
        <text className="mb-rp-sankey-axis" x={LEFT_X - 10} y={18} textAnchor="end">
          收入分类
        </text>
        <text className="mb-rp-sankey-axis" x={MID_X + NODE_W / 2} y={18} textAnchor="middle">
          账户
        </text>
        <text className="mb-rp-sankey-axis" x={RIGHT_X + NODE_W + 10} y={18} textAnchor="start">
          支出分类
        </text>
        {/* 小流量（手续费 / 修正）后画：命中带叠在粗 ribbon 之上才点得到。 */}
        {layout.links.map((item) => (
          <g
            key={item.link.id}
            className={`mb-rp-sankey-link ${toneClass(item.link.tone)}`}
            data-kind={item.link.kind}
          >
            <path className="mb-rp-sankey-ribbon" d={item.d} />
            <path
              className="mb-rp-sankey-hit"
              d={item.d}
              strokeWidth={HIT}
              data-hit={HIT}
              data-amount={item.link.amount}
              data-target={item.link.nodeId}
              onClick={() => onOpen(item.link.nodeId, item.link.amount)}
            />
          </g>
        ))}
        {layout.placed.map((node) => (
          <g
            key={node.id}
            className={`mb-rp-sankey-node ${toneClass(node.tone)}`}
            data-id={node.id}
            data-layer={node.layer}
            data-amount={node.amount}
          >
            <rect className="mb-rp-sankey-node-body" x={node.x} y={node.y} width={NODE_W} height={Math.max(0, node.h)} rx={3} />
            <rect
              className="mb-rp-sankey-node-hit"
              x={node.x - (HIT - NODE_W) / 2}
              y={node.y + node.h / 2 - HIT / 2}
              width={HIT}
              height={Math.max(HIT, node.h)}
              data-hit={HIT}
              onClick={() => onOpen(node.id, node.amount)}
            />
            {node.layer === 1 ? (
              <>
                <text
                  className="mb-rp-sankey-name"
                  x={node.labelX}
                  y={node.y - 9}
                  textAnchor={node.anchor}
                >
                  {node.name}
                </text>
                {node.account && (
                  <text
                    className="mb-rp-sankey-balance"
                    x={node.labelX}
                    y={node.y + node.h + 17}
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
                  y={node.y - 20}
                  textAnchor={node.anchor}
                >
                  {node.name}
                </text>
                <text
                  className="mb-rp-sankey-value"
                  x={node.labelX}
                  y={node.y - 6}
                  textAnchor={node.anchor}
                >
                  {currency(node.amount)}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
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
