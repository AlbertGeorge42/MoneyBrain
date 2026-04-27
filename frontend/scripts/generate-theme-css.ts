/**
 * 主题 CSS 变量生成脚本
 * 从 themes/light.ts 和 themes/dark.ts 生成 theme-vars.css
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { lightThemeValues } from '../src/styles/themes/light'
import { darkThemeValues } from '../src/styles/themes/dark'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function generateCssVariables(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
}

function generateThemeCss(): string {
  const lightVars = generateCssVariables(lightThemeValues)
  const darkVars = generateCssVariables(darkThemeValues)

  return `/**
 * MoneyBrain 设计令牌 CSS 变量
 * 由 scripts/generate-theme-css.ts 自动生成
 * 请勿手动修改此文件
 */

:root {
${lightVars}
}

[data-theme="dark"] {
${darkVars}
}
`
}

const outputPath = join(__dirname, '../src/styles/theme-vars.css')
const cssContent = generateThemeCss()

writeFileSync(outputPath, cssContent, 'utf-8')

console.log('✅ theme-vars.css 已生成')
