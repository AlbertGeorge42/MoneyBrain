import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 串行构建 web 与 api。
 *
 * Windows 上 esbuild 清理系统临时目录时偶发 Access denied；把 TMP/TEMP
 * 指向仓库内的临时目录，避免构建被环境权限打断。构建结束后清理。
 */
const tempDir = resolve('.tmp-build')
mkdirSync(tempDir, { recursive: true })

const env = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir,
  TMPDIR: tempDir,
}

try {
  for (const workspace of ['@moneybrain/web', '@moneybrain/api']) {
    const result = spawnSync(`npm run build -w ${workspace}`, {
      stdio: 'inherit',
      env,
      shell: true,
    })
    if (result.error || result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
