import React, { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty, Button, theme } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { getTokenValue } from '../../styles/theme/css-utils'
import { formatCurrency, formatPercent } from '../../utils/format'
import { formatAmount } from '../../utils/formatAmount'

export interface PieChartDataItem {
  name: string
  value: number
  predictedValue?: number
  categoryId?: string
  hasChildren?: boolean
  isLiability?: boolean
}

interface PieChartProps {
  title: string
  data: PieChartDataItem[]
  height?: number
  onDrillDown?: (item: PieChartDataItem) => Promise<PieChartDataItem[]>
  isPurePrediction?: boolean
}

const PieChart: React.FC<PieChartProps> = ({ title, data, height = 300, onDrillDown, isPurePrediction }) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, title])

  const handleItemClick = async (params: { name?: string }) => {
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
      formatter: (params: { name?: string; value?: number | string; percent?: number }) => {
        const numValue = typeof params.value === 'number' ? params.value : parseFloat(params.value ?? '') || 0
        const value = formatCurrency(numValue, { showSymbol: false })
        const percent = formatPercent(params.percent ?? 0, 1, false)
        const item = currentData.find(d => d.name === params.name!)
        const drillDownHint = item?.hasChildren && onDrillDown ? ' (点击查看明细)' : ''

        if (isPurePrediction) {
          return `${params.name!}: ¥${value} (${percent})${drillDownHint}<br/><span style="color: var(--mb-color-text-secondary)">预测</span>`
        }

        if (item?.predictedValue && item.predictedValue !== 0) {
          // 符号约定：predictedValue 已是带符号（inflow 正、outflow 负、变化方向）
          const predictedDisplay = formatAmount(item.predictedValue, 'flow')

          if (item.isLiability) {
            const currentDebt = formatCurrency(numValue, { showSymbol: false })
            return `${params.name!}: ¥${currentDebt} (${percent})${drillDownHint}<br/>当前欠款: ¥${currentDebt} &nbsp; 预测: ${predictedDisplay.text}`
          }

          const actual = formatCurrency(numValue - item.predictedValue, { showSymbol: false })
          return `${params.name!}: ¥${value} (${percent})${drillDownHint}<br/>实际: ¥${actual} &nbsp; 预测: ${predictedDisplay.text}`
        }

        return `${params.name!}: ¥${value} (${percent})${drillDownHint}`
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
