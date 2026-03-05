import React from 'react'
import ReactECharts from 'echarts-for-react'

interface SankeyNode { name: string }
interface SankeyLink { source: string; target: string; value: number }

interface SankeyChartProps {
  title: string
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
}

const SankeyChart: React.FC<SankeyChartProps> = ({ title, nodes, links, height = 400 }) => {
  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      data: nodes,
      links,
      lineStyle: { color: 'gradient', curveness: 0.5 },
    }],
  }
  return <ReactECharts option={option} style={{ height }} />
}

export default SankeyChart
