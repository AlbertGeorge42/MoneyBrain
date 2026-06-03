import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { getTokenValue } from '../../styles/theme/cssVars'
import { formatCurrency } from '../../utils/format'

export type SankeyNodeCategory = 'income_category' | 'non_cash_source' | 'cash' | 'expense_category' | 'non_cash_target'

export interface SankeyNode { 
  name: string
  category?: SankeyNodeCategory
}
interface SankeyLink { 
  source: string
  target: string
  value: number
  actualValue?: number
  predictedValue?: number
}

interface SankeyChartProps {
  title: string
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
  loading?: boolean
  isPurePrediction?: boolean
}

const SankeyChart: React.FC<SankeyChartProps> = ({ title, nodes, links, height = 400, loading = false, isPurePrediction = false }) => {
  const categoryColors: Record<SankeyNodeCategory, string> = {
    income_category: getTokenValue('--mb-color-income'),
    non_cash_source: getTokenValue('--mb-color-non-cash'),
    cash: getTokenValue('--mb-color-cash'),
    expense_category: getTokenValue('--mb-color-expense'),
    non_cash_target: getTokenValue('--mb-color-refund'),
  }

  const getDisplayName = (name: string): string => {
    const suffixes = ['_income', '_ncs', '_cash', '_expense', '_nct']
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) {
        return name.slice(0, -suffix.length)
      }
    }
    return name
  }

  const validNodes = Array.isArray(nodes) ? nodes : []
  const validLinks = Array.isArray(links) ? links : []

  const hasValidData = validNodes.length > 0 && validLinks.length > 0

  const totalFlow = validLinks.reduce((sum, link) => sum + link.value, 0)

  const nodeFlows: Map<string, number> = new Map()
  validLinks.forEach(link => {
    nodeFlows.set(link.target, (nodeFlows.get(link.target) || 0) + link.value)
    nodeFlows.set(link.source, (nodeFlows.get(link.source) || 0) + link.value)
  })

  const leftCount = validNodes.filter(n => n.category === 'non_cash_source' || n.category === 'income_category').length
  const middleCount = validNodes.filter(n => n.category === 'cash').length
  const rightCount = validNodes.filter(n => n.category === 'non_cash_target' || n.category === 'expense_category').length
  const maxCount = Math.max(leftCount, middleCount, rightCount, 1)

  let leftIndex = 0
  let middleIndex = 0
  let rightIndex = 0

  const nodesWithConfig = validNodes.map(node => {
    let x: number
    let y: number
    
    if (node.category === 'non_cash_source' || node.category === 'income_category') {
      x = 0
      y = (leftIndex + 0.5) / maxCount
      leftIndex++
    } else if (node.category === 'cash') {
      x = 0.5
      y = (middleIndex + 0.5) / maxCount
      middleIndex++
    } else {
      x = 1
      y = (rightIndex + 0.5) / maxCount
      rightIndex++
    }

    return {
      name: node.name,
      x,
      y,
      itemStyle: {
        color: categoryColors[node.category ?? 'cash']
      }
    }
  })

  const option = {
    title: { 
      text: title, 
      left: 'center', 
      textStyle: { fontSize: 14, color: getTokenValue('--mb-color-text-primary') } 
    },
    tooltip: { 
      trigger: 'item', 
      triggerOn: 'mousemove',
      formatter: (params: { dataType?: string; name?: string; value?: number; data?: { source?: string; target?: string; value?: number; predictedValue?: number; actualValue?: number } }) => {
        if (params.dataType === 'node') {
          const nodeFlow = nodeFlows.get(params.name) || 0
          const percentage = totalFlow > 0 ? ((nodeFlow / totalFlow) * 100).toFixed(1) : '0.0'
          return `${getDisplayName(params.name)}<br/>金额: ${formatCurrency(params.value || 0)}<br/>占比: ${percentage}%`
        } else if (params.dataType === 'edge') {
          const link = params.data
          const percentage = totalFlow > 0 ? ((link.value / totalFlow) * 100).toFixed(1) : '0.0'
          const sourceName = getDisplayName(link.source)
          const targetName = getDisplayName(link.target)
          
          if (isPurePrediction) {
            return `${sourceName} → ${targetName}<br/>金额: ${formatCurrency(link.value)} (${percentage}%)<br/><span style="color: var(--mb-color-text-secondary)">预测</span>`
          }
          
          if (link.predictedValue && link.predictedValue !== 0) {
            const predictedSign = link.predictedValue >= 0 ? '+' : ''
            return `${sourceName} → ${targetName}<br/>金额: ${formatCurrency(link.value)} (${percentage}%)<br/>实际 ${formatCurrency(link.actualValue || 0)} &nbsp; 预测 ${predictedSign}${formatCurrency(link.predictedValue)}`
          }
          
          return `${sourceName} → ${targetName}<br/>金额: ${formatCurrency(link.value)} (${percentage}%)`
        }
        return ''
      }
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      layoutIterations: 0,
      emphasis: { focus: 'adjacency' },
      data: nodesWithConfig,
      links: validLinks,
      lineStyle: { 
        color: 'gradient', 
        curveness: 0.5,
        opacity: isPurePrediction ? 0.4 : 0.6
      },
      label: {
        position: 'right',
        color: getTokenValue('--mb-color-text-primary'),
        formatter: (params: { name?: string }) => getDisplayName(params.name)
      },
    }],
  }

  if (loading) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return <ReactECharts option={option} style={{ height }} />
}

export default SankeyChart
