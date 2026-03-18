import React, { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty, Button, Breadcrumb } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

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
  const validData = Array.isArray(data) ? data : []
  const hasValidData = validData.some(d => d.value != null && d.value !== 0)
  
  const [currentData, setCurrentData] = useState<PieChartDataItem[]>(validData)
  const [currentTitle, setCurrentTitle] = useState(title)
  const [breadcrumb, setBreadcrumb] = useState<Array<{ title: string; data: PieChartDataItem[] }>>([])
  const [loading, setLoading] = useState(false)

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

  const handleBreadcrumbClick = (index: number) => {
    if (index === breadcrumb.length - 1) {
      handleBack()
    } else {
      const targetItem = breadcrumb[index]
      setCurrentData(targetItem.data)
      setCurrentTitle(targetItem.title)
      setBreadcrumb(prev => prev.slice(0, index))
    }
  }

  const option = {
    title: { text: currentTitle, left: 'center', textStyle: { fontSize: 14 } },
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
    legend: { orient: 'vertical', left: 'left', top: 'middle' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      data: currentData,
      emphasis: { 
        itemStyle: { 
          shadowBlur: 10, 
          shadowOffsetX: 0, 
          shadowColor: 'rgba(0, 0, 0, 0.5)' 
        } 
      },
      label: { show: false },
    }],
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return (
    <div style={{ height }}>
      {breadcrumb.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button 
            type="text" 
            size="small" 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
          >
            返回
          </Button>
          <Breadcrumb separator=">" style={{ fontSize: 12 }}>
            {breadcrumb.map((item, index) => (
              <Breadcrumb.Item key={index}>
                <a onClick={() => handleBreadcrumbClick(index)}>{item.title}</a>
              </Breadcrumb.Item>
            ))}
            <Breadcrumb.Item>{currentTitle}</Breadcrumb.Item>
          </Breadcrumb>
        </div>
      )}
      <ReactECharts 
        option={option} 
        style={{ height: breadcrumb.length > 0 ? height - 32 : height }} 
        onEvents={{ click: handleItemClick }}
        showLoading={loading}
      />
    </div>
  )
}

export default PieChart
