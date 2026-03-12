import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'

interface SankeyNode { 
  name: string
  category?: string  // 'source' | 'cash' | 'target'
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
  const categoryColors: Record<string, string> = {
    source: '#52c41a',  // 绿色 - 资金来源
    cash: '#1890ff',    // 蓝色 - 现金账户
    target: '#ff4d4f',   // 红色 - 资金用途
  }

  // 数据验证
  const validNodes = Array.isArray(nodes) ? nodes : []
  const validLinks = Array.isArray(links) ? links : []

  // 检查是否有有效数据
  const hasValidData = validNodes.length > 0 && validLinks.length > 0

  // 为节点添加颜色
  const nodesWithColor = validNodes.map(node => ({
    ...node,
    itemStyle: {
      color: categoryColors[node.category || 'cash']
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
          return `${params.name}<br/>金额: ¥${params.value?.toFixed(2) || 0}`
        } else if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}<br/>金额: ¥${params.data.value?.toFixed(2)}`
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
        formatter: '{b}'
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
