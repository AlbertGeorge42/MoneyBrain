/**
 * electron-builder afterPack 钩子。
 *
 * electron-builder 收集生产依赖时会跳过隐藏目录 node_modules/.prisma，
 * 导致打包后 Prisma Client 的生成代码缺失（API 启动时命名导入失败）。
 * 这里把 staged 目录里的生成客户端补拷进最终 app。
 */
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function afterPack(context) {
  const from = path.join(context.packager.projectDir, 'build', 'app', 'node_modules', '.prisma')
  const to = path.join(context.appOutDir, 'resources', 'app', 'node_modules', '.prisma')
  if (!fs.existsSync(from)) throw new Error(`afterPack：缺少 ${from}`)
  await fs.promises.mkdir(path.dirname(to), { recursive: true })
  await fs.promises.cp(from, to, { recursive: true, force: true })
  if (!fs.existsSync(path.join(to, 'client', 'default.js'))) {
    throw new Error(`afterPack：生成客户端补拷失败 ${to}`)
  }
}
