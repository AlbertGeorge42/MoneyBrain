import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'

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
  // 节点分类颜色配置
  const categoryColors: Record<SankeyNodeCategory, string> = {
    income_category: '#52c41a',    // 绿色 - 收入分类
    non_cash_source: '#13c2c2',    // 青色 - 非现金账户（来源）
    cash: '#1890ff',               // 蓝色 - 现金账户
    expense_category: '#ff4d4f',   // 红色 - 支出分类
    non_cash_target: '#fa8c16',    // 橙色 - 非现金账户（去向）
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

  // 为节点添加颜色和显示名称
  const nodesWithColor = validNodes.map(node => ({
    name: node.name,
    itemStyle: {
      color: categoryColors[node.category ?? 'cash']
    }
  }))

  const option = {
    title: { 
      text: title, 
      left: 'center', 
      textStyle: { fontSize: 14 } 
    },
    tooltip: { 
      trigger: 'item', 
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `${getDisplayName(params.name)}<br/>金额: ¥${params.value?.toFixed(2) || 0}`
        } else if (params.dataType === 'edge') {
          return `${getDisplayName(params.data.source)} → ${getDisplayName(params.data.target)}<br/>金额: ¥${params.data.value?.toFixed(2)}`
        }
        return ''
      }
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      data: nodesWithColor,
      links: validLinks,
      lineStyle: { 
        color: 'gradient', 
        curveness: 0.5,
        opacity: 0.6
      },
      label: {
        position: 'right',
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
