import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { getTokenValue } from '../../styles/utils'

export type SankeyNodeCategory = 'income_category' | 'non_cash_source' | 'cash' | 'expense_category' | 'non_cash_target'

export interface SankeyNode { 
  name: string
  category?: SankeyNodeCategory
}
interface SankeyLink { 
  source: string
  target: string
  value: number 
}

interface SankeyChartProps {
  title: string
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
  loading?: boolean
}

const SankeyChart: React.FC<SankeyChartProps> = ({ title, nodes, links, height = 400, loading = false }) => {
  // 节点分类颜色配置 - 使用设计令牌
  const categoryColors: Record<SankeyNodeCategory, string> = {
    income_category: getTokenValue('--mb-color-income'),
    non_cash_source: getTokenValue('--mb-color-non-cash'),
    cash: getTokenValue('--mb-color-cash'),
    expense_category: getTokenValue('--mb-color-expense'),
    non_cash_target: getTokenValue('--mb-color-refund'),
  }

  // 从节点名称中提取显示名称（去掉后缀）
  const getDisplayName = (name: string): string => {
    const suffixes = ['_income', '_ncs', '_cash', '_expense', '_nct']
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) {
        return name.slice(0, -suffix.length)
      }
    }
    return name
  }

  // 数据验证
  const validNodes = Array.isArray(nodes) ? nodes : []
  const validLinks = Array.isArray(links) ? links : []

  // 检查是否有有效数据
  const hasValidData = validNodes.length > 0 && validLinks.length > 0

  // 计算总流量（所有链接的value之和）
  const totalFlow = validLinks.reduce((sum, link) => sum + link.value, 0)

  // 计算每个节点的流量（流入或流出的较大值）
  const nodeFlows: Map<string, number> = new Map()
  validLinks.forEach(link => {
    // 流入
    nodeFlows.set(link.target, (nodeFlows.get(link.target) || 0) + link.value)
    // 流出
    nodeFlows.set(link.source, (nodeFlows.get(link.source) || 0) + link.value)
  })

  // 统计每列的节点数量
  const leftCount = validNodes.filter(n => n.category === 'non_cash_source' || n.category === 'income_category').length
  const middleCount = validNodes.filter(n => n.category === 'cash').length
  const rightCount = validNodes.filter(n => n.category === 'non_cash_target' || n.category === 'expense_category').length
  const maxCount = Math.max(leftCount, middleCount, rightCount, 1)

  // 为节点添加颜色和固定坐标，保持后端传来的排序顺序
  let leftIndex = 0
  let middleIndex = 0
  let rightIndex = 0

  const nodesWithConfig = validNodes.map(node => {
    let x: number
    let y: number
    
    if (node.category === 'non_cash_source' || node.category === 'income_category') {
      // 左侧列
      x = 0
      y = (leftIndex + 0.5) / maxCount
      leftIndex++
    } else if (node.category === 'cash') {
      // 中间列
      x = 0.5
      y = (middleIndex + 0.5) / maxCount
      middleIndex++
    } else {
      // 右侧列
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
      textStyle: { fontSize: 14, color: getTokenValue('--mb-color-text') } 
    },
    tooltip: { 
      trigger: 'item', 
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const nodeFlow = nodeFlows.get(params.name) || 0
          const percentage = totalFlow > 0 ? ((nodeFlow / totalFlow) * 100).toFixed(1) : '0.0'
          return `${getDisplayName(params.name)}<br/>金额: ¥${params.value?.toFixed(2) || 0}<br/>占比: ${percentage}%`
        } else if (params.dataType === 'edge') {
          const percentage = totalFlow > 0 ? ((params.data.value / totalFlow) * 100).toFixed(1) : '0.0'
          return `${getDisplayName(params.data.source)} → ${getDisplayName(params.data.target)}<br/>金额: ¥${params.data.value?.toFixed(2)}<br/>占比: ${percentage}%`
        }
        return ''
      }
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      layoutIterations: 0,  // 禁用自动布局调整，保持我们指定的顺序
      emphasis: { focus: 'adjacency' },
      data: nodesWithConfig,
      links: validLinks,
      lineStyle: { 
        color: 'gradient', 
        curveness: 0.5,
        opacity: 0.6
      },
      label: {
        position: 'right',
        color: getTokenValue('--mb-color-text'),
        formatter: (params: any) => getDisplayName(params.name)
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
