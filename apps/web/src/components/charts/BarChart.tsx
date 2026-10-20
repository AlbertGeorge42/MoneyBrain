import React from 'react'
import BaseChart from './BaseChart'

interface BarChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; predictedData?: number[]; color?: string }>
  height?: number
  loading?: boolean
  isPurePrediction?: boolean
}

const BarChart: React.FC<BarChartProps> = (props) => <BaseChart {...props} chartType="bar" />

export default BarChart