import { useMemo } from 'react'
import { currency } from './reportsModel'
import type { CashSankey, CashSankeyLink, CashSankeyNode } from './cashSankeyModel'

const WIDTH = 980
const HEIGHT = 372
const PAD_X = 16
const PAD_TOP = 32
const PAD_BOTTOM = 26
const NODE_W = 12
const NODE_GAP = 22
const LAYER_GAP = 34
const HIT = 24

interface PlacedNode extends CashSankeyNode {
  x: number
  y: number
  h: number
  labelX: number
  anchor: 'start' | 'end'
}

function nodeToneClass(tone: CashSankeyNode['tone']) {
  return tone === 'income' ? 'is-inflow' : tone === 'expense' ? 'is-outflow' : 'is-neutral'
}

function ribbonPath(x1: number, y1: number, x2: number, y2: number, height: number): string {
  const cx = x1 + (x2 - x1) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2} L ${x2} ${y2 + height} C ${cx} ${y2 + height}, ${cx} ${y1 + height}, ${x1} ${y1 + height} Z`
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
    const opening = data.nodes.find((node) => node.id === 'opening')
    const closing = data.nodes.find((node) => node.id === 'closing')
    const inflowNodes = data.nodes.filter((node) => node.layer === 1 && node.tone === 'income')
    const outflowNodes = data.nodes.filter((node) => node.layer === 1 && node.tone === 'expense')
    if (!opening || !closing) return null

    const available = HEIGHT - PAD_TOP - PAD_BOTTOM
    const middleGaps = LAYER_GAP + Math.max(0, inflowNodes.length - 1) * NODE_GAP + Math.max(0, outflowNodes.length - 1) * NODE_GAP
    const maxValue = Math.max(opening.amount, closing.amount, data.inflow + data.outflow)
    const scale = (available - middleGaps) / Math.max(1, maxValue)

    const placed = new Map<string, PlacedNode>()
    const openingH = Math.max(10, opening.amount * scale)
    const closingH = Math.max(10, closing.amount * scale)
    placed.set('opening', {
      ...opening,
      x: PAD_X,
      y: PAD_TOP + (available - openingH) / 2,
      h: openingH,
      labelX: PAD_X,
      anchor: 'start',
    })
    placed.set('closing', {
      ...closing,
      x: WIDTH - PAD_X - NODE_W,
      y: PAD_TOP + (available - closingH) / 2,
      h: closingH,
      labelX: WIDTH - PAD_X,
      anchor: 'end',
    })

    const heights = new Map(data.nodes.map((node) => [node.id, Math.max(8, node.amount * scale)]))
    const inflowH = inflowNodes.reduce((sum, node) => sum + (heights.get(node.id) ?? 8), 0)
    const outflowH = outflowNodes.reduce((sum, node) => sum + (heights.get(node.id) ?? 8), 0)
    const middleH =
      inflowH +
      outflowH +
      Math.max(0, inflowNodes.length - 1) * NODE_GAP +
      Math.max(0, outflowNodes.length - 1) * NODE_GAP +
      (inflowNodes.length > 0 && outflowNodes.length > 0 ? LAYER_GAP : 0)
    // 中间层整体垂直居中，三层视觉重心一致。
    let cursor = PAD_TOP + Math.max(0, (available - middleH) / 2)
    for (const node of inflowNodes) {
      const h = heights.get(node.id) ?? 8
      placed.set(node.id, {
        ...node,
        x: WIDTH / 2 - NODE_W / 2,
        y: cursor,
        h,
        labelX: WIDTH / 2 + NODE_W / 2 + 8,
        anchor: 'start',
      })
      cursor += h + NODE_GAP
    }
    cursor += LAYER_GAP
    for (const node of outflowNodes) {
      const h = Math.max(8, node.amount * scale)
      placed.set(node.id, {
        ...node,
        x: WIDTH / 2 - NODE_W / 2,
        y: cursor,
        h,
        labelX: WIDTH / 2 + NODE_W / 2 + 8,
        anchor: 'start',
      })
      cursor += h + NODE_GAP
    }

    const outCursors = new Map<string, number>()
    const inCursors = new Map<string, number>()
    for (const node of placed.values()) {
      outCursors.set(node.id, node.y)
      inCursors.set(node.id, node.y)
    }

    const links = data.links.map((link) => {
      const source = placed.get(link.sourceId)
      const target = placed.get(link.targetId)
      if (!source || !target) return null
      const height = Math.max(2, link.amount * scale)
      const sourceY = outCursors.get(link.sourceId) ?? source.y
      const targetY = inCursors.get(link.targetId) ?? target.y
      outCursors.set(link.sourceId, sourceY + height)
      inCursors.set(link.targetId, targetY + height)
      const x1 = source.x + NODE_W
      const x2 = target.x
      return { link, x1, y1: sourceY, x2, y2: targetY, height }
    })

    return {
      placed: [...placed.values()],
      links: links.filter(
        (item): item is { link: CashSankeyLink; x1: number; y1: number; x2: number; y2: number; height: number } => item !== null,
      ),
    }
  }, [data])

  if (data.status !== 'ready' || !layout) {
    return (
      <div className="mb-rp-sankey-fail" role="status">
        {data.reason ?? '现金流分组合计与对账总额不一致，桑基已停画。'}
      </div>
    )
  }

  return (
    <div className="mb-rp-sankey">
      <svg
        className="mb-rp-sankey-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`现金流桑基图：期初 ${currency(data.opening)}，流入 ${currency(data.inflow)}，流出 ${currency(data.outflow)}，期末 ${currency(data.closing)}`}
      >
        {/* 小流量（手续费 / 修正）后画：命中带叠在粗 ribbon 之上才点得到。 */}
        {layout.links
          .slice()
          .sort((left, right) => right.link.amount - left.link.amount)
          .map((item) => (
            <g key={item.link.id} className={`mb-rp-sankey-link ${item.link.tone === 'income' ? 'is-inflow' : 'is-outflow'}`}>
              <path className="mb-rp-sankey-ribbon" d={ribbonPath(item.x1, item.y1, item.x2, item.y2, item.height)} />
              <path
                className="mb-rp-sankey-hit"
                d={ribbonPath(item.x1, item.y1, item.x2, item.y2, item.height)}
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
            className={`mb-rp-sankey-node ${nodeToneClass(node.tone)}`}
            data-id={node.id}
            data-amount={node.amount}
          >
            <rect x={node.x} y={node.y} width={NODE_W} height={node.h} rx={3} />
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
              // 中间层节点多、间距小：名称与金额合成一行，避免两行标签相互压字。
              <text
                x={node.labelX}
                y={node.y + node.h / 2 + 4}
                textAnchor={node.anchor}
                className="mb-rp-sankey-label"
              >
                {node.name} · {currency(node.amount)}
              </text>
            ) : (
              <>
                <text
                  x={node.labelX}
                  y={node.y - 6}
                  textAnchor={node.anchor}
                  className="mb-rp-sankey-name"
                >
                  {node.name}
                </text>
                <text
                  x={node.labelX}
                  y={node.y + Math.max(node.h, 10) + 14}
                  textAnchor={node.anchor}
                  className="mb-rp-sankey-value"
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
      {(data.hiddenGroups > 0 || data.transferExcluded > 0) && (
        <p className="mb-rp-chart-note">
          {data.hiddenGroups > 0 ? `已隐藏 ${data.hiddenGroups} 组，并入「其他」以保持守恒；` : ''}
          {data.transferExcluded > 0 ? `账户间转账 ${currency(data.transferExcluded)} 为内部转移，不进桑基。` : ''}
        </p>
      )}
    </div>
  )
}
