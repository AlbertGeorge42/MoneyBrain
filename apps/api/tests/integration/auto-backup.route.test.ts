import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import path from 'path'
import { existsSync, rmSync } from 'node:fs'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

// B3 验收：开关与目录可读写；执行时机由内部策略决定，接口只暴露只读状态
// （上次成功 / 预计窗口 / 当前份数）。
// F-C 起导出即加密容器，云同步目录不再需要显式确认，因此接口不再有
// confirmCloudDirectory 参数。自动备份配置跟着数据库走（DATABASE_URL 同目录），
// 即本次运行独占的临时目录，随运行结束一起清理。

const dbPath = (process.env.DATABASE_URL ?? '').replace(/^file:/, '')
const configPath = path.join(path.dirname(dbPath), 'auto-backup-config.json')

describe('自动备份 API（B3）', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    if (existsSync(configPath)) {
      rmSync(configPath)
    }
    await prisma.$disconnect()
  })

  it('默认配置：未开启，含只读状态字段', async () => {
    const response = await request(app).get('/api/data/auto-backup')
    expect(response.status).toBe(200)
    expect(response.body.data.enabled).toBe(false)
    expect(response.body.data.defaultDirectory).toBeTruthy()
    expect(response.body.data).toHaveProperty('nextWindowAt')
    expect(response.body.data).toHaveProperty('backupCount')
  })

  it('开启时云同步目录可直接使用（导出的已是加密容器）', async () => {
    const cloudDirectory = 'C:\\Users\\me\\OneDrive\\moneybrain-backup'

    const accepted = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: true, directory: cloudDirectory })
    expect(accepted.status).toBe(200)
    expect(accepted.body.data.enabled).toBe(true)
    expect(accepted.body.data.directory).toBe(cloudDirectory)

    // 关闭调度收尾，避免定时器泄漏到测试进程
    const disabled = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: false })
    expect(disabled.status).toBe(200)
    expect(disabled.body.data.enabled).toBe(false)
  })

  it('参数校验：enabled 必须是布尔值', async () => {
    const response = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: 'yes' })
    expect(response.status).toBe(400)
  })
})
