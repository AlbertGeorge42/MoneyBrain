import React, { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useChartTokens } from '../../styles/theme/chart-tokens'
import { toRgba } from '../../utils/color'
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

export type PieChartLayout = 'normal' | 'compact'

interface PieChartProps {
  title: string
  data: PieChartDataItem[]
  height?: number
  layout?: PieChartLayout
  onDrillDown?: (item: PieChartDataItem) => Promise<PieChartDataItem[]>
  isPurePrediction?: boolean
}

const PieChart: React.FC<PieChartProps> = ({ title, data, height = 300, layout = 'normal', onDrillDown, isPurePrediction }) => {
  const tokens = useChartTokens()
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

  const isCompact = layout === 'compact'

  const dataWithColors = useMemo(() => {
    return currentData.map((item, index) => ({
      ...item,
      itemStyle: { color: tokens.palette[index % tokens.palette.length] },
    }))
  }, [currentData, tokens.palette])

  const option = useMemo(() => ({
    title: {
      text: currentTitle,
      left: 'center',
      textStyle: { fontSize: 14, color: tokens.title },
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
          return `${params.name!}: ¥${value} (${percent})${drillDownHint}<br/><span style="color: ${tokens.textSecondary}">预测</span>`
        }

        if (item?.predictedValue && item.predictedValue !== 0) {
          const predictedDisplay = formatAmount(item.predictedValue, 'flow')

          if (item.isLiability) {
            const currentDebt = formatCurrency(numValue, { showSymbol: false })
            return `${params.name!}: ¥${currentDebt} (${percent})${drillDownHint}<br/>当前欠款: ¥${currentDebt} &nbsp; 预测: ${predictedDisplay.text}`
          }

          const actual = formatCurrency(numValue - item.predictedValue, { showSymbol: false })
          return `${params.name!}: ¥${value} (${percent})${drillDownHint}<br/>实际: ¥${actual} &nbsp; 预测: ${predictedDisplay.text}`
        }

        return `${params.name!}: ¥${value} (${percent})${drillDownHint}`
      },
    },
    legend: {
      orient: isCompact ? 'horizontal' : 'vertical',
      left: isCompact ? 'center' : 'left',
      top: isCompact ? 'bottom' : 'middle',
      textStyle: { color: tokens.legend },
    },
    series: [{
      type: 'pie',
      radius: isCompact ? ['35%', '60%'] : ['40%', '70%'],
      center: isCompact ? ['50%', '42%'] : ['60%', '50%'],
      data: dataWithColors,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: toRgba(tokens.textSecondary, 0.5),
        },
      },
      label: { show: false },
    }],
  }), [currentTitle, currentData, dataWithColors, isCompact, isPurePrediction, tokens, onDrillDown])

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
            color: tokens.title,
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