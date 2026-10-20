/**
 * 通用浏览器端文件下载工具
 */

/**
 * 把 Blob 触发为浏览器下载，下载完成后释放 ObjectURL。
 * @param blob 要下载的文件
 * @param filename 建议的文件名（不含路径）
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (!blob || blob.size === 0) {
    throw new Error('导出的文件为空')
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

/**
 * 生成带日期的文件名：`<prefix>-YYYY-MM-DD.<ext>`
 */
export function todayFilename(prefix: string, ext: string): string {
  const date = new Date().toISOString().split('T')[0]
  return `${prefix}-${date}.${ext}`
}
