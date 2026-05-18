import React, { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty, Button, theme } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { getTokenValue } from '../../styles/theme/cssVars'

export interface PieChartDataItem {
  name: string
  value: number
  categoryId?: string
  hasChildren?: boolean
}

interface PieChartProps {
  title: string
  data: PieChartDataItem[]
  height?: number
  onDrillDown?: (item: PieChartDataItem) => Promise<PieChartDataItem[]>
}

const PieChart: React.FC<PieChartProps> = ({ title, data, height = 300, onDrillDown }) => {
  const { token } = theme.useToken()
  const validData = Array.isArray(data) ? data : []

  const [currentData, setCurrentData] = useState<PieChartDataItem[]>(validData)
  const [currentTitle, setCurrentTitle] = useState(title)
  const [breadcrumb, setBreadcrumb] = useState<Array<{ title: string; data: PieChartDataItem[] }>>([])
  const [loading, setLoading] = useState(false)

  const hasValidData = currentData.some(d => d.value != null && d.value !== 0)

  React.useEffect(() => {
    setCurrentData(validData)
    setCurrentTitle(title)
    setBreadcrumb([])
  }, [data, title])

  const handleItemClick = async (params: any) => {
    const clickedItem = validData.find(d => d.name === params.name) ||
                        currentData.find(d => d.name === params.name)

    if (!clickedItem || !clickedItem.hasChildren || !onDrillDown) {
      return
    }

    setLoading(true)
    try {
      const subData = await onDrillDown(clickedItem)
      if (subData && subData.length > 0) {
        setBreadcrumb(prev => [...prev, { title: currentTitle, data: currentData }])
        setCurrentData(subData)
        setCurrentTitle(clickedItem.name)
      }
    } catch (error) {
      console.error('获取二级分类数据失败:', error)
    }
    setLoading(false)
  }

  const handleBack = () => {
    if (breadcrumb.length > 0) {
      const lastItem = breadcrumb[breadcrumb.length - 1]
      setCurrentData(lastItem.data)
      setCurrentTitle(lastItem.title)
      setBreadcrumb(prev => prev.slice(0, -1))
    }
  }

  const option = {
    title: {
      text: currentTitle,
      left: 'center',
      textStyle: { fontSize: 14, color: getTokenValue('--mb-color-text-primary') },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const numValue = typeof params.value === 'number' ? params.value : parseFloat(params.value) || 0
        const value = numValue.toFixed(2)
        const percent = params.percent?.toFixed(1) || '0.0'
        const item = currentData.find(d => d.name === params.name)
        const drillDownHint = item?.hasChildren && onDrillDown ? ' (点击查看明细)' : ''
        return `${params.name}: ¥${value} (${percent}%)${drillDownHint}`
      }
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle',
      textStyle: { color: token.colorTextTertiary },
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      data: currentData,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(128, 128, 128, 0.5)'
        }
      },
      label: { show: false },
    }],
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return (
    <div style={{ height, position: 'relative' }}>
      {breadcrumb.length > 0 && (
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
            color: getTokenValue('--mb-color-text-primary'),
          }}
        >
          返回
        </Button>
      )}
      <ReactECharts
        option={option}
        style={{ height }}
        onEvents={{ click: handleItemClick }}
        showLoading={loading}
      />
    </div>
  )
}

export default PieChart
